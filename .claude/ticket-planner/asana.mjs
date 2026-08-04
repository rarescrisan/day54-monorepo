#!/usr/bin/env node
// Shared plumbing for the ticket planner: REST client, markdown ⇄ html_notes
// converters, custom-field builders, tag resolution and state I/O.
//
// Everything else in this directory imports from here. In particular the two
// markdown converters live here and ONLY here: sync.mjs detects drift by
// projecting both sides through the same conversion, so a second copy that
// drifted would report phantom diffs on tickets nobody touched.
//
// Run directly for one-time discovery of the fixed identifiers below:
//   ASANA_TOKEN=… node .claude/ticket-planner/asana.mjs --setup
//
// Node >= 20, zero npm dependencies (global fetch).

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Fixed identifiers
// ---------------------------------------------------------------------------
// Discovered once with `--setup` and pasted here on purpose: they are stable
// for the life of the board, and hardcoding them keeps every script free of
// discovery round-trips and of "which project did this run write to?" doubt.
//
// GIDs are STRINGS. Asana GIDs exceed 2^53 and are documented as opaque —
// never parseInt them, never compare with ==.
//
// A null PRIORITY_FIELD_GID or STORY_POINTS_FIELD_GID puts the planner in
// degraded mode for that field: it is neither written nor synced. That is the
// correct state on a free Asana tier, where custom fields are unavailable.
export const CONFIG = {
  WORKSPACE_GID: null,
  PROJECT_GID: null,
  // Who new tasks are assigned to. null leaves them unassigned.
  DEFAULT_ASSIGNEE_GID: null,
  PRIORITY_FIELD_GID: null,
  PRIORITY_OPTION_GIDS: {
    P1: null,
    P2: null,
    P3: null,
    P4: null,
    P5: null,
  },
  STORY_POINTS_FIELD_GID: null,
};

export const PRIORITIES = ["P1", "P2", "P3", "P4", "P5"];
export const TICKET_TYPES = ["Epic", "Story", "Sub-task"];

const API_BASE = "https://app.asana.com/api/1.0";

// Asana's free tier allows ~150 requests/minute per workspace. Spacing every
// call by 420ms keeps a long replay comfortably under that without needing to
// react to 429s in the common case. Paid tiers allow far more; this is a floor,
// not a tuning knob worth touching.
const MIN_REQUEST_INTERVAL_MS = 420;
const MAX_RETRIES = 5;

// Fields to request on any task read. Asana returns a compact record by
// default — a missing opt_field reads as undefined, which is indistinguishable
// from "empty" and silently corrupts a sync. Always ask explicitly.
export const TASK_OPT_FIELDS = [
  "name",
  "notes",
  "html_notes",
  "completed",
  "modified_at",
  "permalink_url",
  "parent.gid",
  "parent.name",
  "num_subtasks",
  "assignee.gid",
  "tags.gid",
  "tags.name",
  "memberships.section.gid",
  "memberships.section.name",
  "custom_fields.gid",
  "custom_fields.name",
  "custom_fields.number_value",
  "custom_fields.enum_value.gid",
  "custom_fields.enum_value.name",
].join(",");

// ---------------------------------------------------------------------------
// Errors and credentials
// ---------------------------------------------------------------------------

export class AsanaError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "AsanaError";
    this.status = status;
    this.body = body;
  }
}

/** Exit code 2 means "operator needs to fix their environment", never a bug. */
export function die(message) {
  console.error(`✖ ${message}`);
  process.exit(2);
}

let cachedToken;

// Fallback credential source: .claude/.env (gitignored — see repo .gitignore).
// Accepts ASANA_TOKEN or ASANA_ACCESS_TOKEN (the latter matches the
// ASANA_ACCESS_TOKEN repo secret used by .github/workflows/asana-sync.yml).
const ENV_FILE = new URL("../.env", import.meta.url);

function tokenFromEnvFile() {
  let text;
  try {
    text = fs.readFileSync(ENV_FILE, "utf8");
  } catch {
    return undefined;
  }
  for (const line of text.split("\n")) {
    const match = line.match(
      /^\s*(?:export\s+)?(?:ASANA_TOKEN|ASANA_ACCESS_TOKEN)\s*=\s*(.*?)\s*$/,
    );
    if (match) return match[1].replace(/^(["'])(.*)\1$/, "$2");
  }
  return undefined;
}

export function token() {
  if (cachedToken) return cachedToken;
  const value =
    process.env.ASANA_TOKEN ||
    process.env.ASANA_ACCESS_TOKEN ||
    tokenFromEnvFile();
  if (!value || !value.trim()) {
    die(
      "No Asana token found.\n" +
        "  Create a personal access token at https://app.asana.com/0/my-apps\n" +
        "  then either export it for this shell only:  export ASANA_TOKEN=…\n" +
        "  or put it in the gitignored env file:  echo 'ASANA_ACCESS_TOKEN=…' > .claude/.env\n" +
        "  Never write it into a tracked file in this repo.",
    );
  }
  cachedToken = value.trim();
  return cachedToken;
}

export function requireConfig(keys = ["WORKSPACE_GID", "PROJECT_GID"]) {
  const missing = keys.filter((key) => !CONFIG[key]);
  if (missing.length > 0) {
    die(
      `${missing.join(", ")} not set in .claude/ticket-planner/asana.mjs.\n` +
        "  Run the one-time discovery and paste the printed block:\n" +
        "    ASANA_TOKEN=… node .claude/ticket-planner/asana.mjs --setup",
    );
  }
}

// ---------------------------------------------------------------------------
// REST client
// ---------------------------------------------------------------------------

let nextRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const now = Date.now();
  if (now < nextRequestAt) await sleep(nextRequestAt - now);
  nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
}

function buildUrl(endpoint, query) {
  const url = new URL(
    endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`,
  );
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * One Asana API call. Returns the unwrapped `data` payload.
 *
 * `body` is the third POSITIONAL argument and is wrapped in Asana's required
 * `{ data: … }` envelope for you — writes are the common case, so they read as
 * `request("POST", "/tasks", { name })`. Query params go in the options bag:
 * `request("GET", "/tasks/1", null, { query: { opt_fields } })`.
 *
 * Retries on 429 (honouring Retry-After) and on 5xx, because a replay that
 * dies halfway through pass 2 is far more expensive than waiting.
 */
export async function request(method, endpoint, body = null, { query } = {}) {
  const url = buildUrl(endpoint, query);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await throttle();

    let response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token()}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify({ data: body }) : undefined,
      });
    } catch (cause) {
      // Network-level failure: retry, then give up with the real cause.
      if (attempt === MAX_RETRIES) {
        throw new AsanaError(`${method} ${endpoint} failed: ${cause.message}`);
      }
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "30");
      const waitMs = (Number.isFinite(retryAfter) ? retryAfter : 30) * 1000;
      console.warn(`  ⏳ rate limited; waiting ${waitMs / 1000}s`);
      await sleep(waitMs);
      continue;
    }

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    if (response.status >= 500 && attempt < MAX_RETRIES) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }

    if (!response.ok) {
      const detail =
        payload?.errors?.map((error) => error.message).join("; ") ??
        payload.raw ??
        response.statusText;
      throw new AsanaError(
        `${method} ${endpoint} → ${response.status}: ${detail}`,
        {
          status: response.status,
          body: payload,
        },
      );
    }

    return payload.data ?? payload;
  }

  throw new AsanaError(`${method} ${endpoint}: retries exhausted`);
}

/**
 * GET every page of a collection endpoint.
 *
 * Asana paginates with opaque `next_page.offset` tokens. Not following them is
 * silent truncation — the worst failure mode here, because a half-read board
 * looks like a complete one.
 */
export async function getAll(endpoint, query = {}) {
  const items = [];
  let offset;

  do {
    const url = buildUrl(endpoint, { limit: 100, ...query, offset });
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token()}`,
        Accept: "application/json",
      },
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") ?? "30");
      await sleep((Number.isFinite(retryAfter) ? retryAfter : 30) * 1000);
      continue;
    }

    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const detail =
        payload?.errors?.map((error) => error.message).join("; ") ??
        response.statusText;
      throw new AsanaError(`GET ${endpoint} → ${response.status}: ${detail}`, {
        status: response.status,
        body: payload,
      });
    }

    items.push(...(payload.data ?? []));
    offset = payload.next_page?.offset;
    await throttle();
  } while (offset);

  return items;
}

// ---------------------------------------------------------------------------
// markdown ⇄ html_notes
// ---------------------------------------------------------------------------
// Asana rejects any tag outside the supported subset with a 400, so the
// converter emits only tags verified against
// https://developers.asana.com/docs/rich-text :
//
//   body h1 h2 strong em u s code a ol ul li blockquote pre hr/ img
//
// We use a deliberate subset of that: h1 h2 strong em code a ol ul li pre hr/.
// Asana also forbids nesting headers/blockquote/pre inside list items and vice
// versa, which is why nested markdown lists are flattened to one level.
//
// NOT supported, and lost on the way in: tables, images, task lists, nested
// lists, more than two heading levels (h3+ degrade to h2).

const INLINE_CODE = /`([^`]+)`/g;
const BOLD = /\*\*([^*]+)\*\*/g;
const ITALIC = /(^|[^*\w])\*([^*\n]+)\*(?=[^*\w]|$)/g;
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Inline markdown → inline html. Escapes first, so user text can't inject tags. */
function inlineToHtml(text) {
  return escapeXml(text)
    .replace(INLINE_CODE, (_, code) => `<code>${code}</code>`)
    .replace(BOLD, (_, inner) => `<strong>${inner}</strong>`)
    .replace(ITALIC, (_, lead, inner) => `${lead}<em>${inner}</em>`)
    .replace(
      LINK,
      (_, label, href) => `<a href="${href}">${label || href}</a>`,
    );
}

/** Inline html → inline markdown. The exact inverse of inlineToHtml. */
function inlineToMarkdown(html) {
  return unescapeXml(
    html
      .replace(/<a\s+href="([^"]*)"\s*>([\s\S]*?)<\/a>/g, (_, href, label) =>
        label === href ? `[${href}](${href})` : `[${label}](${href})`,
      )
      .replace(/<code>([\s\S]*?)<\/code>/g, "`$1`")
      .replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**")
      .replace(/<b>([\s\S]*?)<\/b>/g, "**$1**")
      .replace(/<em>([\s\S]*?)<\/em>/g, "*$1*")
      .replace(/<i>([\s\S]*?)<\/i>/g, "*$1*")
      .replace(/<u>([\s\S]*?)<\/u>/g, "$1")
      .replace(/<s>([\s\S]*?)<\/s>/g, "$1")
      .replace(/<br\s*\/?>/g, "\n"),
  );
}

/**
 * markdown → the `html_notes` value Asana accepts (including the <body> wrapper).
 *
 * Block grammar: `#`/`##`/`###+` headings, `---` rules, ```fences```, `-`/`*`
 * bullets, `1.` ordered items, everything else a paragraph. Consecutive
 * paragraph lines are joined with a space — Asana has no <p>, so hand-wrapping
 * cannot survive the round trip and pretending otherwise would report drift on
 * every sync.
 */
export function markdownToHtmlNotes(markdown) {
  const lines = String(markdown ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const blocks = [];

  let paragraph = [];
  let list = null; // { tag: "ul" | "ol", items: string[] }
  let fence = null; // string[] of raw code lines

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(inlineToHtml(paragraph.join(" ")));
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((item) => `<li>${inlineToHtml(item)}</li>`);
      blocks.push(`<${list.tag}>${items.join("")}</${list.tag}>`);
      list = null;
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");

    if (fence !== null) {
      if (/^\s*```/.test(line)) {
        blocks.push(`<pre>${escapeXml(fence.join("\n"))}</pre>`);
        fence = null;
      } else {
        fence.push(rawLine);
      }
      continue;
    }

    if (/^\s*```/.test(line)) {
      flushAll();
      fence = [];
      continue;
    }

    if (line.trim() === "") {
      flushAll();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      // Asana offers h1 and h2 only; deeper levels degrade rather than 400.
      const level = heading[1].length === 1 ? "h1" : "h2";
      blocks.push(`<${level}>${inlineToHtml(heading[2])}</${level}>`);
      continue;
    }

    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      flushAll();
      blocks.push("<hr/>");
      continue;
    }

    // Nested list items are flattened to one level: Asana forbids the nesting
    // and a silently dropped indent is better than a 400.
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      if (list?.tag !== "ul") {
        flushList();
        list = { tag: "ul", items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      flushParagraph();
      if (list?.tag !== "ol") {
        flushList();
        list = { tag: "ol", items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  if (fence !== null) blocks.push(`<pre>${escapeXml(fence.join("\n"))}</pre>`);
  flushAll();

  // Blocks are separated by a BLANK line, not a single newline. With a single
  // newline a paragraph boundary is indistinguishable from a soft wrap, so
  // reading the notes back and re-converting merges the two paragraphs — and
  // normalizeMarkdown stops being idempotent, which makes sync report drift on
  // tickets nobody touched.
  return `<body>${blocks.join("\n\n")}</body>`;
}

/** html_notes → markdown. Inverts markdownToHtmlNotes block for block. */
export function htmlNotesToMarkdown(htmlNotes) {
  const raw = String(htmlNotes ?? "").trim();
  if (!raw) return "";

  const body = /^<body>([\s\S]*)<\/body>$/.exec(raw);
  const inner = body ? body[1] : raw;

  // One entry per block. Joined with a blank line at the end, so paragraph
  // boundaries survive a re-conversion (see markdownToHtmlNotes).
  const out = [];
  const pushText = (chunk) => {
    for (const part of chunk.split(/\n{2,}/)) {
      // A lone newline inside a text run is a soft wrap — Asana's editor makes
      // them freely. Collapse to a space so the projection is idempotent; this
      // is the documented "paragraph wrapping collapses" limitation.
      const text = inlineToMarkdown(part)
        .replace(/\s*\n\s*/g, " ")
        .trim();
      if (text) out.push(text);
    }
  };

  const blockRe =
    /<(h1|h2|ul|ol|pre|blockquote)>([\s\S]*?)<\/\1>|<hr\s*\/?>|<img\b[^>]*\/?>/g;
  let cursor = 0;
  let match;

  while ((match = blockRe.exec(inner)) !== null) {
    pushText(inner.slice(cursor, match.index));
    cursor = blockRe.lastIndex;

    const [whole, tag, content] = match;

    if (!tag) {
      // <hr/> or <img …>; only the rule has a markdown equivalent.
      if (/^<hr/.test(whole)) out.push("---");
      continue;
    }

    if (tag === "h1") {
      out.push(`# ${inlineToMarkdown(content).trim()}`);
    } else if (tag === "h2") {
      out.push(`## ${inlineToMarkdown(content).trim()}`);
    } else if (tag === "pre") {
      out.push(["```", unescapeXml(content), "```"].join("\n"));
    } else if (tag === "blockquote") {
      out.push(`> ${inlineToMarkdown(content).trim()}`);
    } else {
      // A list is ONE block: its items are consecutive lines with no blank
      // line between them, or re-parsing would read each as its own list.
      const items = [...content.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(
        (item, index) => {
          const text = inlineToMarkdown(item[1])
            .replace(/\s*\n\s*/g, " ")
            .trim();
          return tag === "ol" ? `${index + 1}. ${text}` : `- ${text}`;
        },
      );
      if (items.length > 0) out.push(items.join("\n"));
    }
  }

  pushText(inner.slice(cursor));

  return out.join("\n\n").trim();
}

/**
 * Project markdown through the converter pair.
 *
 * This is what sync.mjs compares — never the raw strings. Comparing raw text
 * would report drift on every ticket whose description merely wraps differently
 * than Asana stores it.
 */
export function normalizeMarkdown(markdown) {
  return htmlNotesToMarkdown(markdownToHtmlNotes(markdown));
}

// ---------------------------------------------------------------------------
// Field builders
// ---------------------------------------------------------------------------

/**
 * The `custom_fields` map for a create/update payload.
 *
 * Silently omits a field whose GID is null (degraded mode) and a value that is
 * null — Asana treats an omitted key as "leave alone", which is what both the
 * free tier and a Story-Points-less Epic want.
 */
export function buildCustomFields({ priority, storyPoints } = {}) {
  const fields = {};

  if (CONFIG.PRIORITY_FIELD_GID && priority) {
    const optionGid = CONFIG.PRIORITY_OPTION_GIDS[priority];
    if (!optionGid) {
      throw new AsanaError(
        `No enum-option GID configured for priority "${priority}". ` +
          "Re-run --setup, or fix PRIORITY_OPTION_GIDS in asana.mjs.",
      );
    }
    fields[CONFIG.PRIORITY_FIELD_GID] = optionGid;
  }

  if (
    CONFIG.STORY_POINTS_FIELD_GID &&
    storyPoints !== null &&
    storyPoints !== undefined
  ) {
    fields[CONFIG.STORY_POINTS_FIELD_GID] = storyPoints;
  }

  return fields;
}

/** Read the Priority enum name off a task record, or null. */
export function readPriority(task) {
  if (!CONFIG.PRIORITY_FIELD_GID) return null;
  const field = task.custom_fields?.find(
    (candidate) => candidate.gid === CONFIG.PRIORITY_FIELD_GID,
  );
  return field?.enum_value?.name ?? null;
}

/** Read the Story Points number off a task record, or null. */
export function readStoryPoints(task) {
  if (!CONFIG.STORY_POINTS_FIELD_GID) return null;
  const field = task.custom_fields?.find(
    (candidate) => candidate.gid === CONFIG.STORY_POINTS_FIELD_GID,
  );
  return field?.number_value ?? null;
}

// ---------------------------------------------------------------------------
// Tags (workspace-global, matched by exact name)
// ---------------------------------------------------------------------------

let tagCache = null;

/** name → gid for every tag in the workspace, fetched once per process. */
async function loadTags() {
  if (tagCache) return tagCache;
  requireConfig(["WORKSPACE_GID"]);
  const tags = await getAll(`/workspaces/${CONFIG.WORKSPACE_GID}/tags`, {
    opt_fields: "name",
  });
  tagCache = new Map(tags.map((tag) => [tag.name, tag.gid]));
  return tagCache;
}

/**
 * Resolve tag names to GIDs, creating any that don't exist yet.
 *
 * Tags are workspace-global in Asana, so "create or reuse by exact name" is the
 * only sane policy — creating a second `frontend` tag is invisible on the board
 * and splits every future filter.
 */
export async function resolveTagGids(names = []) {
  if (names.length === 0) return [];
  const cache = await loadTags();
  const gids = [];

  for (const name of names) {
    let gid = cache.get(name);
    if (!gid) {
      const created = await request("POST", "/tags", {
        name,
        workspace: CONFIG.WORKSPACE_GID,
      });
      gid = created.gid;
      cache.set(name, gid);
      console.log(`  + created tag "${name}" (${gid})`);
    }
    gids.push(gid);
  }

  return gids;
}

// ---------------------------------------------------------------------------
// Ticket file + state I/O
// ---------------------------------------------------------------------------

export function readTickets(inputPath) {
  if (!fs.existsSync(inputPath)) die(`No such tickets file: ${inputPath}`);

  const tickets = [];
  const lines = fs.readFileSync(inputPath, "utf8").split("\n");

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      tickets.push(JSON.parse(trimmed));
    } catch (cause) {
      die(`${inputPath}:${index + 1} is not valid JSON — ${cause.message}`);
    }
  });

  const seen = new Set();
  for (const ticket of tickets) {
    if (!ticket.local_id) die(`A ticket in ${inputPath} has no local_id`);
    if (seen.has(ticket.local_id)) {
      die(`Duplicate local_id "${ticket.local_id}" in ${inputPath}`);
    }
    seen.add(ticket.local_id);
    if (!TICKET_TYPES.includes(ticket.type)) {
      die(
        `${ticket.local_id} has type "${ticket.type}"; expected one of ${TICKET_TYPES.join(", ")}`,
      );
    }
  }

  return tickets;
}

/** Rewrite a tickets JSONL, preserving row order. */
export function writeTickets(inputPath, tickets) {
  const body = tickets.map((ticket) => JSON.stringify(ticket)).join("\n");
  fs.writeFileSync(inputPath, `${body}\n`);
}

export const EMPTY_STATE = { issues: {}, homed: [], links: [], sync: {} };

export function defaultStatePath(inputPath) {
  return path.join(path.dirname(inputPath), "state.json");
}

export function readState(statePath) {
  if (!fs.existsSync(statePath)) return structuredClone(EMPTY_STATE);
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  return {
    issues: state.issues ?? {},
    homed: state.homed ?? [],
    links: state.links ?? [],
    sync: state.sync ?? {},
  };
}

/**
 * Persist state. Called after EVERY write to Asana, which is what makes replay
 * resumable: the process can die at any point and the next run knows exactly
 * what already exists. Written via a temp file + rename so a kill mid-write
 * cannot leave truncated JSON.
 */
export function writeState(statePath, state) {
  const temp = `${statePath}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temp, statePath);
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/**
 * Minimal `--flag value` / `--boolean` parser.
 *
 * `booleans` names the flags that take no value, so `--smoke --input x` doesn't
 * swallow `--input` as `--smoke`'s argument.
 */
export function parseArgs(argv, booleans = []) {
  const args = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (booleans.includes(key)) {
      args[key] = true;
    } else {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        die(`--${key} needs a value`);
      }
      args[key] = next;
      index += 1;
    }
  }

  args._ = positional;
  return args;
}

/** Split a comma-separated --keys value into planner IDs. */
export function parseKeys(value) {
  if (!value) return null;
  return value
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// --setup: one-time discovery of the fixed identifiers
// ---------------------------------------------------------------------------

async function promptLine(question) {
  process.stdout.write(question);
  return new Promise((resolve) => {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (chunk) => resolve(chunk.trim()));
  });
}

function renderConstantsBlock(discovered) {
  const options = PRIORITIES.map(
    (name) =>
      `    ${name}: ${JSON.stringify(discovered.priorityOptions[name] ?? null)},`,
  ).join("\n");

  return `export const CONFIG = {
  WORKSPACE_GID: ${JSON.stringify(discovered.workspaceGid)},
  PROJECT_GID: ${JSON.stringify(discovered.projectGid)},
  // Who new tasks are assigned to. null leaves them unassigned.
  DEFAULT_ASSIGNEE_GID: ${JSON.stringify(discovered.assigneeGid)},
  PRIORITY_FIELD_GID: ${JSON.stringify(discovered.priorityFieldGid)},
  PRIORITY_OPTION_GIDS: {
${options}
  },
  STORY_POINTS_FIELD_GID: ${JSON.stringify(discovered.storyPointsFieldGid)},
};`;
}

async function createPriorityField(workspaceGid, projectGid) {
  const field = await request("POST", "/custom_fields", {
    workspace: workspaceGid,
    name: "Priority",
    resource_subtype: "enum",
    type: "enum",
    enum_options: PRIORITIES.map((name) => ({ name })),
  });
  await request("POST", `/projects/${projectGid}/addCustomFieldSetting`, {
    custom_field: field.gid,
  });
  return field;
}

async function createStoryPointsField(workspaceGid, projectGid) {
  const field = await request("POST", "/custom_fields", {
    workspace: workspaceGid,
    name: "Story Points",
    resource_subtype: "number",
    type: "number",
    precision: 0,
  });
  await request("POST", `/projects/${projectGid}/addCustomFieldSetting`, {
    custom_field: field.gid,
  });
  return field;
}

async function setup() {
  token();

  console.log("Asana planner setup — discovering the fixed identifiers.\n");

  const workspaces = await getAll("/workspaces", { opt_fields: "name" });
  if (workspaces.length === 0) die("This token can see no workspaces.");

  console.log("Workspaces:");
  workspaces.forEach((workspace, index) => {
    console.log(`  ${index + 1}. ${workspace.name}  (${workspace.gid})`);
  });
  const workspaceChoice = await promptLine("\nWorkspace number: ");
  const workspace = workspaces[Number(workspaceChoice) - 1];
  if (!workspace) die(`Not a workspace on that list: "${workspaceChoice}"`);

  const projects = await getAll(`/workspaces/${workspace.gid}/projects`, {
    opt_fields: "name",
    archived: false,
  });
  if (projects.length === 0) {
    die(`No projects in ${workspace.name}. Create the board in Asana first.`);
  }

  console.log(`\nProjects in ${workspace.name}:`);
  projects.forEach((project, index) => {
    console.log(`  ${index + 1}. ${project.name}  (${project.gid})`);
  });
  const projectChoice = await promptLine("\nProject number (the board): ");
  const project = projects[Number(projectChoice) - 1];
  if (!project) die(`Not a project on that list: "${projectChoice}"`);

  const me = await request("GET", "/users/me", null, {
    query: { opt_fields: "name,email" },
  });
  console.log(`\nToken belongs to: ${me.name} (${me.gid})`);
  const assigneeAnswer = await promptLine(
    "Assign new tasks to this user by default? [Y/n]: ",
  );
  const assigneeGid = /^n/i.test(assigneeAnswer) ? null : me.gid;

  const detail = await request("GET", `/projects/${project.gid}`, null, {
    query: {
      opt_fields:
        "name,custom_field_settings.custom_field.gid," +
        "custom_field_settings.custom_field.name," +
        "custom_field_settings.custom_field.resource_subtype," +
        "custom_field_settings.custom_field.enum_options.gid," +
        "custom_field_settings.custom_field.enum_options.name",
    },
  });

  const fields = (detail.custom_field_settings ?? []).map(
    (setting) => setting.custom_field,
  );
  console.log("\nCustom fields on this project:");
  if (fields.length === 0) {
    console.log("  (none)");
  } else {
    for (const field of fields) {
      console.log(
        `  - ${field.name} [${field.resource_subtype}] (${field.gid})`,
      );
    }
  }

  let priorityField = fields.find((field) => field.name === "Priority");
  let storyPointsField = fields.find((field) => field.name === "Story Points");

  if (!priorityField || !storyPointsField) {
    console.log(
      "\nMissing field(s). Custom fields require a paid Asana tier — on the free\n" +
        "tier creating them will fail, and the planner then runs in degraded mode\n" +
        "(priority and points recorded as tags only).",
    );
    const answer = await promptLine("Create the missing field(s) now? [y/N]: ");

    if (/^y/i.test(answer)) {
      try {
        if (!priorityField) {
          priorityField = await createPriorityField(workspace.gid, project.gid);
          console.log(`  + created Priority (${priorityField.gid})`);
        }
        if (!storyPointsField) {
          storyPointsField = await createStoryPointsField(
            workspace.gid,
            project.gid,
          );
          console.log(`  + created Story Points (${storyPointsField.gid})`);
        }
      } catch (error) {
        console.warn(
          `\n⚠ Could not create custom fields: ${error.message}\n` +
            "  This is what a free-tier workspace looks like. Leaving the field GIDs\n" +
            "  null puts the planner in degraded mode, which is a working setup.",
        );
      }
    }
  }

  // A freshly created enum field's options come back on the create response; an
  // existing one needs the enum_options we asked for above.
  const priorityOptions = {};
  for (const option of priorityField?.enum_options ?? []) {
    if (PRIORITIES.includes(option.name))
      priorityOptions[option.name] = option.gid;
  }

  const missingOptions = PRIORITIES.filter((name) => !priorityOptions[name]);
  if (priorityField && missingOptions.length > 0) {
    console.warn(
      `\n⚠ Priority field has no option named: ${missingOptions.join(", ")}.\n` +
        "  Add them in Asana (Priority must offer P1–P5), then re-run --setup.",
    );
  }

  const block = renderConstantsBlock({
    workspaceGid: workspace.gid,
    projectGid: project.gid,
    assigneeGid,
    priorityFieldGid: priorityField?.gid ?? null,
    priorityOptions,
    storyPointsFieldGid: storyPointsField?.gid ?? null,
  });

  console.log(
    "\n" +
      "─".repeat(72) +
      "\nPaste this over the CONFIG block in .claude/ticket-planner/asana.mjs:\n" +
      "─".repeat(72) +
      `\n\n${block}\n\n` +
      "─".repeat(72) +
      "\nThen prove the credentials end to end:\n" +
      "  node .claude/ticket-planner/replay.mjs --smoke\n",
  );

  process.exit(0);
}

// Run as a CLI only when invoked directly, so importing this module is free of
// side effects.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2), ["setup", "help"]);
  if (args.setup) {
    await setup();
  } else {
    console.log(
      "asana.mjs — shared planner plumbing.\n\n" +
        "  --setup   discover workspace/project/custom-field GIDs and print the\n" +
        "            CONFIG block to paste into this file\n\n" +
        "Everything else here is imported by replay.mjs, sync.mjs and board.mjs.",
    );
  }
}
