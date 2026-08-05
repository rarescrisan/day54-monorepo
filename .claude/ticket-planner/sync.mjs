#!/usr/bin/env node
// Two-way, field-level sync between a dry-run JSONL and the Asana board.
//
//   node sync.mjs --status   --input <tickets.jsonl> [--state <state.json>]
//   node sync.mjs --adopt    --input …    # record the baseline, change nothing else
//   node sync.mjs --pull     --input …    # Asana → JSONL, only fields marked pull
//   node sync.mjs --push     --input …    # JSONL → Asana, only fields marked push
//   node sync.mjs --pull-new --input …    # adopt tasks created straight on the board
//
//   --keys WEB-CTA-3,WEB-CTA-4            scope to specific planner IDs
//   --force                               resolve conflict/diverged in this
//                                         mode's direction (requires --keys)
//
// The model: state.json carries a `sync` baseline — the value of every synced
// field as it stood on BOTH sides at the last sync. That is what makes the
// direction of a change knowable instead of guessed:
//
//   in-sync     both sides equal
//   push →      only the local file moved since the baseline
//   pull ←      only Asana moved since the baseline
//   conflict !! both moved, to different values
//   diverged ?? they differ and there is no baseline to attribute it to
//
// Nothing is ever written until you pick a direction. There is no auto-merge.
//
// Never synced in either direction: section/column, completion, assignee,
// parent, dependencies. Workflow state belongs to Asana; the scripts read it
// and never write it.

import {
  CONFIG,
  buildCustomFields,
  defaultStatePath,
  die,
  htmlNotesToMarkdown,
  markdownToHtmlNotes,
  normalizeMarkdown,
  parseArgs,
  parseKeys,
  readPriority,
  readState,
  readStoryPoints,
  readTickets,
  request,
  requireConfig,
  resolveTagGids,
  TASK_OPT_FIELDS,
  token,
  writeState,
  writeTickets,
} from "./asana.mjs";

const MODES = ["status", "adopt", "pull", "push", "pull-new"];

const args = parseArgs(process.argv.slice(2), [...MODES, "force", "help"]);

if (args.help) {
  console.log(
    "sync.mjs — reconcile a dry-run JSONL with the Asana board\n\n" +
      "  --status | --adopt | --pull | --push | --pull-new\n" +
      "  --input <file>   tickets JSONL (required)\n" +
      "  --state <file>   default: <input-dir>/state.json\n" +
      "  --keys <ids>     comma-separated planner IDs to scope to\n" +
      "  --force          resolve conflict/diverged this direction (needs --keys)\n",
  );
  process.exit(0);
}

const mode = MODES.find((candidate) => args[candidate]);
if (!mode) die(`Pick a mode: ${MODES.map((m) => `--${m}`).join(" | ")}`);
if (!args.input) die("--input <tickets.jsonl> is required");

// --force board-wide would silently overwrite whichever side happened to lose.
// Conflict resolution is a per-ticket human decision, so it needs --keys.
if (args.force && !args.keys) {
  die("--force is only valid together with --keys; never board-wide.");
}

token();

// Validate the file before the config, so a malformed JSONL is reported as
// such rather than as "you haven't run --setup".
const statePath = args.state ?? defaultStatePath(args.input);
const tickets = readTickets(args.input);
const state = readState(statePath);
const only = parseKeys(args.keys);

requireConfig(["WORKSPACE_GID", "PROJECT_GID"]);

// ---------------------------------------------------------------------------
// The synced fields
// ---------------------------------------------------------------------------
// Each field knows how to read itself from both sides, and how to write itself
// to each side. `comparable` is what the drift check compares — descriptions go
// through the shared converter so cosmetic differences never look like drift.

const FIELDS = {
  summary: {
    local: (ticket) => ticket.summary ?? "",
    remote: (task) => task.name ?? "",
    comparable: (value) => String(value ?? "").trim(),
    toLocal: (ticket, value) => {
      ticket.summary = value;
    },
    toRemote: (value) => ({ name: value }),
  },

  description_markdown: {
    local: (ticket) => ticket.description_markdown ?? "",
    remote: (task) => htmlNotesToMarkdown(task.html_notes ?? ""),
    // Projecting BOTH sides through the same converter is the whole trick: a
    // description that merely wraps differently than Asana stores it must not
    // read as a change.
    comparable: (value) => normalizeMarkdown(value),
    toLocal: (ticket, value) => {
      ticket.description_markdown = value;
    },
    toRemote: (value) => ({ html_notes: markdownToHtmlNotes(value) }),
  },

  labels: {
    local: (ticket) => ticket.labels ?? [],
    remote: (task) => (task.tags ?? []).map((tag) => tag.name),
    // Tag order is not meaningful in Asana and not stable across reads.
    comparable: (value) => [...(value ?? [])].sort().join("|"),
    toLocal: (ticket, value) => {
      ticket.labels = value;
    },
    // Tags are not settable via PUT /tasks — they need addTag/removeTag calls,
    // so this field declares a custom writer instead.
    remoteWriter: async (gid, value, task) => {
      const desired = new Set(value ?? []);
      const current = new Map(
        (task.tags ?? []).map((tag) => [tag.name, tag.gid]),
      );

      for (const [name, tagGid] of current) {
        if (!desired.has(name)) {
          await request("POST", `/tasks/${gid}/removeTag`, { tag: tagGid });
        }
      }
      const toAdd = [...desired].filter((name) => !current.has(name));
      for (const tagGid of await resolveTagGids(toAdd)) {
        await request("POST", `/tasks/${gid}/addTag`, { tag: tagGid });
      }
    },
  },

  priority: {
    enabled: () => Boolean(CONFIG.PRIORITY_FIELD_GID),
    local: (ticket) => ticket.priority ?? null,
    remote: (task) => readPriority(task),
    comparable: (value) => value ?? "",
    toLocal: (ticket, value) => {
      ticket.priority = value;
    },
    toRemote: (value) => ({
      custom_fields: buildCustomFields({ priority: value }),
    }),
  },

  story_points: {
    enabled: () => Boolean(CONFIG.STORY_POINTS_FIELD_GID),
    // Points ladder up: sub-tasks carry 1–3, a story's points is the sum of
    // its sub-tasks, an epic's the sum of its stories — so every type syncs.
    local: (ticket) => ticket.story_points ?? null,
    remote: (task) => readStoryPoints(task),
    comparable: (value) =>
      value === null || value === undefined ? "" : String(value),
    toLocal: (ticket, value) => {
      ticket.story_points = value;
    },
    toRemote: (value) => ({
      custom_fields: buildCustomFields({ storyPoints: value }),
    }),
  },
};

const FIELD_NAMES = Object.keys(FIELDS);

function activeFields(ticket) {
  return FIELD_NAMES.filter((name) => {
    const field = FIELDS[name];
    if (field.enabled && !field.enabled()) return false;
    if (field.appliesTo && !field.appliesTo(ticket)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const STATUS = {
  IN_SYNC: "in-sync",
  PUSH: "push →",
  PULL: "pull ←",
  CONFLICT: "conflict !!",
  DIVERGED: "diverged ??",
};

/**
 * Decide which way a single field moved.
 *
 * With a baseline the answer is knowable: whichever side differs from the
 * baseline is the side that changed. Without one, all we know is that they
 * differ — which is `diverged`, not a guess.
 */
function classify(localValue, remoteValue, baseline, compare) {
  const local = compare(localValue);
  const remote = compare(remoteValue);

  if (local === remote) return STATUS.IN_SYNC;
  if (baseline === undefined) return STATUS.DIVERGED;

  const localMoved = local !== baseline;
  const remoteMoved = remote !== baseline;

  if (localMoved && !remoteMoved) return STATUS.PUSH;
  if (remoteMoved && !localMoved) return STATUS.PULL;
  return STATUS.CONFLICT;
}

// ---------------------------------------------------------------------------
// Fetch the mapped tasks
// ---------------------------------------------------------------------------

const mapped = tickets.filter((ticket) => {
  if (only && !only.includes(ticket.local_id)) return false;
  return Boolean(state.issues[ticket.local_id]?.gid);
});

const unmapped = tickets.filter(
  (ticket) =>
    (!only || only.includes(ticket.local_id)) &&
    !state.issues[ticket.local_id]?.gid,
);

if (only) {
  const unknown = only.filter(
    (key) => !tickets.some((ticket) => ticket.local_id === key),
  );
  if (unknown.length > 0) die(`Not in ${args.input}: ${unknown.join(", ")}`);
}

/** GID → task record, or the string "gone" for a 404. */
const remoteById = new Map();

if (mode !== "pull-new") {
  for (const ticket of mapped) {
    const { gid } = state.issues[ticket.local_id];
    try {
      const task = await request("GET", `/tasks/${gid}`, null, {
        query: { opt_fields: TASK_OPT_FIELDS },
      });
      remoteById.set(ticket.local_id, task);
    } catch (error) {
      if (error.status === 404) {
        remoteById.set(ticket.local_id, "gone");
      } else {
        throw error;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Build the drift report
// ---------------------------------------------------------------------------

function baselineFor(localId, fieldName) {
  return state.sync?.[localId]?.[fieldName];
}

function buildReport() {
  const rows = [];

  for (const ticket of mapped) {
    const task = remoteById.get(ticket.local_id);
    if (task === "gone") {
      rows.push({ localId: ticket.local_id, gone: true, fields: [] });
      continue;
    }

    const fields = activeFields(ticket).map((name) => {
      const field = FIELDS[name];
      const localValue = field.local(ticket);
      const remoteValue = field.remote(task);
      return {
        name,
        localValue,
        remoteValue,
        status: classify(
          localValue,
          remoteValue,
          baselineFor(ticket.local_id, name),
          field.comparable,
        ),
      };
    });

    rows.push({ localId: ticket.local_id, ticket, task, fields });
  }

  return rows;
}

function shortValue(value) {
  const text = Array.isArray(value) ? value.join(", ") : String(value ?? "");
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 68 ? `${oneLine.slice(0, 65)}…` : oneLine;
}

function printReport(rows) {
  let drifted = 0;

  for (const row of rows) {
    if (row.gone) {
      console.log(`${row.localId}  [gone] — GID in state.json returns 404`);
      console.log(
        "    The local row is left alone. Delete it, or re-create the task.",
      );
      drifted += 1;
      continue;
    }

    const moved = row.fields.filter((field) => field.status !== STATUS.IN_SYNC);
    if (moved.length === 0) continue;

    drifted += 1;
    console.log(`${row.localId}  ${row.ticket.summary}`);
    for (const field of moved) {
      console.log(`    ${field.status.padEnd(12)} ${field.name}`);
      console.log(`      local : ${shortValue(field.localValue)}`);
      console.log(`      asana : ${shortValue(field.remoteValue)}`);
    }
  }

  if (unmapped.length > 0) {
    console.log(
      `\n${unmapped.length} local ticket(s) have no Asana task yet: ` +
        `${unmapped.map((ticket) => ticket.local_id).join(", ")}`,
    );
    console.log("  Run replay.mjs to create them.");
  }

  if (drifted === 0) {
    console.log(`✓ no drift across ${rows.length} mapped ticket(s)`);
  } else {
    console.log(`\n${drifted} ticket(s) with drift, of ${rows.length} mapped.`);
  }

  return drifted;
}

// ---------------------------------------------------------------------------
// Baseline recording
// ---------------------------------------------------------------------------

/**
 * Record the baseline for whatever currently agrees.
 *
 * Only in-sync fields are recorded: writing a baseline over a field that still
 * differs would launder a real conflict into "in-sync" on the next run.
 */
function adoptBaseline(rows, { includeAll = false } = {}) {
  state.sync ??= {};
  let recorded = 0;

  for (const row of rows) {
    if (row.gone) continue;
    state.sync[row.localId] ??= {};

    for (const field of row.fields) {
      if (!includeAll && field.status !== STATUS.IN_SYNC) continue;
      state.sync[row.localId][field.name] = FIELDS[field.name].comparable(
        field.localValue,
      );
      recorded += 1;
    }
  }

  writeState(statePath, state);
  return recorded;
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

if (mode === "status") {
  const rows = buildReport();
  printReport(rows);
  process.exit(0);
}

if (mode === "adopt") {
  const rows = buildReport();
  const stillDiffering = rows.flatMap((row) =>
    row.fields.filter((field) => field.status !== STATUS.IN_SYNC),
  );

  const recorded = adoptBaseline(rows);
  console.log(`✓ baseline recorded for ${recorded} field(s) that agree`);

  if (stillDiffering.length > 0) {
    console.log(
      `\n⚠ ${stillDiffering.length} field(s) still differ and were NOT baselined.\n` +
        "  Resolve them first (--pull / --push, or --keys … --force), then --adopt again.\n" +
        "  Run --status to see them.",
    );
  }
  process.exit(0);
}

if (mode === "push" || mode === "pull") {
  const rows = buildReport();
  const wanted = mode === "push" ? STATUS.PUSH : STATUS.PULL;

  let written = 0;
  let skipped = 0;
  const localFileChanged = [];

  for (const row of rows) {
    if (row.gone) {
      console.log(`${row.localId}  [gone] — skipped`);
      continue;
    }

    // A push writes ONLY the fields it is pushing. That is what lets one ticket
    // push some fields and pull others in the same session without either
    // direction clobbering the other.
    const targets = row.fields.filter((field) => {
      if (field.status === wanted) return true;
      if (!args.force) return false;
      return (
        field.status === STATUS.CONFLICT || field.status === STATUS.DIVERGED
      );
    });

    skipped += row.fields.filter(
      (field) => field.status !== STATUS.IN_SYNC && !targets.includes(field),
    ).length;

    if (targets.length === 0) continue;

    if (mode === "push") {
      const { gid } = state.issues[row.localId];
      let payload = {};

      for (const field of targets) {
        const definition = FIELDS[field.name];
        if (definition.remoteWriter) {
          await definition.remoteWriter(gid, field.localValue, row.task);
        } else {
          const patch = definition.toRemote(field.localValue);
          payload = {
            ...payload,
            ...patch,
            // Two custom fields in one PUT must merge, not replace each other.
            ...(patch.custom_fields
              ? {
                  custom_fields: {
                    ...(payload.custom_fields ?? {}),
                    ...patch.custom_fields,
                  },
                }
              : {}),
          };
        }
        written += 1;
      }

      if (Object.keys(payload).length > 0) {
        await request("PUT", `/tasks/${gid}`, payload);
      }
      console.log(
        `→ ${row.localId}  pushed ${targets.map((field) => field.name).join(", ")}`,
      );
    } else {
      for (const field of targets) {
        FIELDS[field.name].toLocal(row.ticket, field.remoteValue);
        written += 1;
      }
      localFileChanged.push(row.localId);
      console.log(
        `← ${row.localId}  pulled ${targets.map((field) => field.name).join(", ")}`,
      );
    }

    // The baseline for a field we just wrote is now the value both sides hold.
    state.sync ??= {};
    state.sync[row.localId] ??= {};
    for (const field of targets) {
      const definition = FIELDS[field.name];
      state.sync[row.localId][field.name] = definition.comparable(
        mode === "push" ? field.localValue : field.remoteValue,
      );
    }
    writeState(statePath, state);
  }

  if (localFileChanged.length > 0) writeTickets(args.input, tickets);

  console.log(
    `\n✓ ${written} field(s) ${mode === "push" ? "pushed" : "pulled"}`,
  );
  if (skipped > 0) {
    console.log(
      `  ${skipped} drifted field(s) left alone (wrong direction, or a ` +
        "conflict needing --keys … --force).",
    );
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// --pull-new: adopt tasks somebody created directly in Asana
// ---------------------------------------------------------------------------

if (mode === "pull-new") {
  const knownGids = new Set(
    Object.values(state.issues)
      .map((entry) => entry.gid)
      .filter(Boolean),
  );

  // Only subtasks of already-mapped epics and stories are discoverable. A whole
  // new epic belongs in its own dry-run folder, not bolted onto this one.
  const parents = tickets.filter(
    (ticket) =>
      (ticket.type === "Epic" || ticket.type === "Story") &&
      state.issues[ticket.local_id]?.gid,
  );

  const discovered = [];

  for (const parent of parents) {
    const { gid } = state.issues[parent.local_id];
    let children;
    try {
      children = await request("GET", `/tasks/${gid}/subtasks`, null, {
        query: { opt_fields: TASK_OPT_FIELDS },
      });
    } catch (error) {
      if (error.status === 404) continue;
      throw error;
    }

    for (const child of children ?? []) {
      if (knownGids.has(child.gid)) continue;
      discovered.push({ parent, task: child });
    }
  }

  if (discovered.length === 0) {
    console.log(
      "✓ nothing new — every subtask of a mapped task already has a row",
    );
    process.exit(0);
  }

  /** Next free number in a series like WEB-CTA-1.2 or WEB-CTA-7. */
  function nextLocalId(parent) {
    const isEpic = parent.type === "Epic";
    const prefix = isEpic
      ? parent.local_id.replace(/-E\d+$/, "")
      : parent.local_id;
    const pattern = isEpic
      ? new RegExp(`^${escapeRe(prefix)}-(\\d+)$`)
      : new RegExp(`^${escapeRe(prefix)}\\.(\\d+)$`);

    let highest = 0;
    for (const ticket of tickets) {
      const match = pattern.exec(ticket.local_id);
      if (match) highest = Math.max(highest, Number(match[1]));
    }
    return isEpic ? `${prefix}-${highest + 1}` : `${prefix}.${highest + 1}`;
  }

  function escapeRe(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  for (const { parent, task } of discovered) {
    const localId = nextLocalId(parent);
    const isStory = parent.type === "Epic";

    const row = {
      local_id: localId,
      type: isStory ? "Story" : "Sub-task",
      summary: task.name ?? "(untitled)",
      priority: readPriority(task) ?? "P3",
      labels: (task.tags ?? []).map((tag) => tag.name),
      story_points: readStoryPoints(task) ?? null,
      description_markdown: htmlNotesToMarkdown(task.html_notes ?? ""),
    };

    if (isStory) {
      row.epic_local_id = parent.local_id;
      // Dependencies are not discoverable this way — fill them in by hand.
      row.blocks = [];
      row.blocked_by = [];
    } else {
      row.parent_local_id = parent.local_id;
    }

    tickets.push(row);
    state.issues[localId] = {
      gid: task.gid,
      permalink: task.permalink_url ?? null,
    };
    console.log(`+ ${localId}  ${row.summary}  (under ${parent.local_id})`);
  }

  writeTickets(args.input, tickets);
  writeState(statePath, state);

  console.log(
    `\n✓ appended ${discovered.length} row(s) to ${args.input}\n\n` +
      "Dependencies came back empty — Asana's subtask listing doesn't carry them.\n" +
      "Fill in blocks/blocked_by by hand, update recommended-order.md and\n" +
      "asana-map.md, then record the baseline:\n" +
      `  node .claude/ticket-planner/sync.mjs --adopt --input ${args.input} --state ${statePath}`,
  );
  process.exit(0);
}
