#!/usr/bin/env node
// Create Asana tasks from a dry-run JSONL. The ONLY write path for creation.
//
//   node replay.mjs --input <tickets.jsonl> [--state <state.json>]
//   node replay.mjs --smoke
//   node replay.mjs --input <tickets.jsonl> --update WEB-CTA-3,WEB-CTA-4
//
// Four passes, in order:
//   1. Epics      POST /tasks with projects:[PROJECT]
//   2. Stories    POST /tasks with parent=<epic>, then addProject to multi-home
//                 them onto the board (an Asana subtask is invisible on the
//                 board otherwise)
//   3. Deps       POST /tasks/{dependent}/addDependencies
//   4. Sub-tasks  POST /tasks with parent=<story>, NOT multi-homed — they are
//                 checklist items, not cards
//
// Resumability is the whole design: state is written to disk after EVERY single
// API call, so a crash, a 429 storm or a Ctrl-C costs nothing. Re-running the
// identical command picks up exactly where it stopped and never double-creates.

import {
  CONFIG,
  buildCustomFields,
  defaultStatePath,
  die,
  markdownToHtmlNotes,
  parseArgs,
  parseKeys,
  readState,
  readTickets,
  request,
  requireConfig,
  resolveTagGids,
  token,
  writeState,
} from "./asana.mjs";

const args = parseArgs(process.argv.slice(2), ["smoke", "help"]);

if (args.help) {
  console.log(
    "replay.mjs — create Asana tasks from a dry-run JSONL (resumable)\n\n" +
      "  --input <file>     tickets JSONL (required unless --smoke)\n" +
      "  --state <file>     state file (default: <input-dir>/state.json)\n" +
      "  --smoke            create one throwaway task and print its permalink\n" +
      "  --update <ids>     overwrite these tickets' fields from the JSONL,\n" +
      "                     cascading to their sub-tasks\n",
  );
  process.exit(0);
}

token();

// ---------------------------------------------------------------------------
// --smoke: prove the credentials and the project GID before doing real work
// ---------------------------------------------------------------------------

if (args.smoke) {
  requireConfig(["PROJECT_GID"]);
  const task = await request("POST", "/tasks", {
    projects: [CONFIG.PROJECT_GID],
    name: `[smoke] planner connectivity check ${new Date().toISOString()}`,
    html_notes: markdownToHtmlNotes(
      "Created by `replay.mjs --smoke` to prove the token and project GID.\n\n" +
        "Safe to delete — nothing references it.",
    ),
  });
  console.log(`✓ created smoke task: ${task.permalink_url ?? task.gid}`);
  console.log("  Delete it in the Asana UI; nothing in the planner tracks it.");
  process.exit(0);
}

if (!args.input) die("--input <tickets.jsonl> is required (or --smoke)");

// Validate the file before the config: a plan is written and reviewed long
// before anyone runs --setup, so "line 4 is not valid JSON" has to be reachable
// without a configured board.
const statePath = args.state ?? defaultStatePath(args.input);
const tickets = readTickets(args.input);
const state = readState(statePath);

requireConfig(["WORKSPACE_GID", "PROJECT_GID"]);
const updateOnly = parseKeys(args.update);

const byId = new Map(tickets.map((ticket) => [ticket.local_id, ticket]));
const epics = tickets.filter((ticket) => ticket.type === "Epic");
const stories = tickets.filter((ticket) => ticket.type === "Story");
const subtasks = tickets.filter((ticket) => ticket.type === "Sub-task");

console.log(`Replaying ${args.input}`);
console.log(
  `  ${epics.length} epic(s), ${stories.length} story(ies), ${subtasks.length} sub-task(s)`,
);
console.log(`  state: ${statePath}`);
if (!CONFIG.PRIORITY_FIELD_GID || !CONFIG.STORY_POINTS_FIELD_GID) {
  console.log(
    "  degraded mode: " +
      [
        CONFIG.PRIORITY_FIELD_GID ? null : "Priority",
        CONFIG.STORY_POINTS_FIELD_GID ? null : "Story Points",
      ]
        .filter(Boolean)
        .join(" and ") +
      " not configured; those values stay in the JSONL only",
  );
}
console.log("");

/** Save after every call — this is what makes the whole thing resumable. */
function checkpoint() {
  writeState(statePath, state);
}

function gidOf(localId) {
  const gid = state.issues[localId]?.gid;
  if (!gid) {
    die(
      `${localId} has no Asana GID in ${statePath}.\n` +
        "  Its parent pass has not run yet — replay the passes in order, or\n" +
        "  the state file belongs to a different tickets file.",
    );
  }
  return gid;
}

/** The create/update payload shared by all three ticket types. */
async function taskPayload(ticket) {
  const payload = {
    name: ticket.summary,
    html_notes: markdownToHtmlNotes(ticket.description_markdown ?? ""),
  };

  if (CONFIG.DEFAULT_ASSIGNEE_GID)
    payload.assignee = CONFIG.DEFAULT_ASSIGNEE_GID;

  const customFields = buildCustomFields({
    priority: ticket.priority,
    storyPoints: ticket.story_points ?? null,
  });
  if (Object.keys(customFields).length > 0)
    payload.custom_fields = customFields;

  const tagGids = await resolveTagGids(ticket.labels ?? []);
  if (tagGids.length > 0) payload.tags = tagGids;

  return payload;
}

// ---------------------------------------------------------------------------
// --update: overwrite existing tickets' fields, cascading to sub-tasks
// ---------------------------------------------------------------------------

if (updateOnly) {
  const targets = new Set(updateOnly);
  // Cascade: updating a story also refreshes its sub-tasks, because their text
  // usually references the parent's requirements.
  for (const subtask of subtasks) {
    if (targets.has(subtask.parent_local_id)) targets.add(subtask.local_id);
  }

  for (const localId of targets) {
    const ticket = byId.get(localId);
    if (!ticket) {
      console.warn(`  ! ${localId} is not in ${args.input}; skipping`);
      continue;
    }
    const gid = gidOf(localId);
    // PUT replaces only the fields present in the payload; sections,
    // completion, dependencies and parentage are untouched by design.
    // Asana rejects `tags` on PUT (create-time or addTag/removeTag only).
    const payload = await taskPayload(ticket);
    delete payload.tags;
    await request("PUT", `/tasks/${gid}`, payload);
    console.log(`  ↻ ${localId}  ${ticket.summary}`);
  }

  console.log(`\n✓ updated ${targets.size} ticket(s)`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Pass 1 — Epics
// ---------------------------------------------------------------------------

console.log("Pass 1/4 — epics");
for (const epic of epics) {
  if (state.issues[epic.local_id]) {
    console.log(`  = ${epic.local_id} exists`);
    continue;
  }
  const task = await request("POST", "/tasks", {
    ...(await taskPayload(epic)),
    projects: [CONFIG.PROJECT_GID],
  });
  state.issues[epic.local_id] = {
    gid: task.gid,
    permalink: task.permalink_url ?? null,
  };
  checkpoint();
  console.log(`  + ${epic.local_id}  ${epic.summary}`);
}

// ---------------------------------------------------------------------------
// Pass 2 — Stories: subtask of their epic, then multi-homed onto the board
// ---------------------------------------------------------------------------

console.log("\nPass 2/4 — stories");
for (const story of stories) {
  if (!story.epic_local_id)
    die(`${story.local_id} (Story) has no epic_local_id`);

  if (!state.issues[story.local_id]) {
    const task = await request("POST", "/tasks", {
      ...(await taskPayload(story)),
      // `parent` at create time gives the hierarchy. Note that a task created
      // with a parent is NOT in any project yet — that is the addProject below.
      parent: gidOf(story.epic_local_id),
    });
    state.issues[story.local_id] = {
      gid: task.gid,
      permalink: task.permalink_url ?? null,
    };
    checkpoint();
    console.log(`  + ${story.local_id}  ${story.summary}`);
  } else {
    console.log(`  = ${story.local_id} exists`);
  }

  // Multi-home as a separate, separately-recorded step: creation and board
  // visibility can fail independently, and a story that exists but never got
  // homed is invisible on the board — the single most confusing failure here.
  if (!state.homed.includes(story.local_id)) {
    await request("POST", `/tasks/${gidOf(story.local_id)}/addProject`, {
      project: CONFIG.PROJECT_GID,
    });
    state.homed.push(story.local_id);
    checkpoint();
    console.log(`    ↳ homed onto the board`);
  }
}

// ---------------------------------------------------------------------------
// Pass 3 — dependencies
// ---------------------------------------------------------------------------

console.log("\nPass 3/4 — dependencies");

// `blocks` and `blocked_by` describe the same edge from opposite ends. Collapse
// both spellings into one canonical "<dependent> depends on <blocker>" key so a
// pair declared twice creates one dependency, not two.
const edges = new Map();
for (const ticket of tickets) {
  for (const blocker of ticket.blocked_by ?? []) {
    edges.set(`${ticket.local_id}<-${blocker}`, {
      dependent: ticket.local_id,
      blocker,
    });
  }
  for (const dependent of ticket.blocks ?? []) {
    edges.set(`${dependent}<-${ticket.local_id}`, {
      dependent,
      blocker: ticket.local_id,
    });
  }
}

if (edges.size === 0) console.log("  (none declared)");

for (const [key, { dependent, blocker }] of edges) {
  if (state.links.includes(key)) {
    console.log(`  = ${key} exists`);
    continue;
  }
  if (!byId.has(blocker)) {
    console.warn(
      `  ! ${dependent} is blocked_by unknown ticket "${blocker}"; skipping`,
    );
    continue;
  }
  try {
    await request("POST", `/tasks/${gidOf(dependent)}/addDependencies`, {
      dependencies: [gidOf(blocker)],
    });
    state.links.push(key);
    checkpoint();
    console.log(`  + ${dependent} blocked by ${blocker}`);
  } catch (error) {
    // Dependencies are a paid-tier feature. Losing them must not lose the
    // tasks that were already created.
    console.warn(
      `  ! could not link ${dependent} ← ${blocker}: ${error.message}\n` +
        "    (task dependencies require a paid Asana tier; the edge stays in the JSONL)",
    );
  }
}

// ---------------------------------------------------------------------------
// Pass 4 — sub-tasks (parented, deliberately NOT multi-homed)
// ---------------------------------------------------------------------------

console.log("\nPass 4/4 — sub-tasks");
if (subtasks.length === 0) console.log("  (none)");

for (const subtask of subtasks) {
  if (!subtask.parent_local_id) {
    die(`${subtask.local_id} (Sub-task) has no parent_local_id`);
  }
  if (state.issues[subtask.local_id]) {
    console.log(`  = ${subtask.local_id} exists`);
    continue;
  }
  const task = await request("POST", "/tasks", {
    ...(await taskPayload(subtask)),
    parent: gidOf(subtask.parent_local_id),
  });
  state.issues[subtask.local_id] = {
    gid: task.gid,
    permalink: task.permalink_url ?? null,
  };
  checkpoint();
  console.log(`  + ${subtask.local_id}  ${subtask.summary}`);
}

// ---------------------------------------------------------------------------

console.log(
  `\n✓ replay complete — ${Object.keys(state.issues).length} task(s) mapped`,
);
console.log("\nPermalinks:");
for (const ticket of tickets) {
  const entry = state.issues[ticket.local_id];
  if (entry)
    console.log(
      `  ${ticket.local_id.padEnd(14)} ${entry.permalink ?? entry.gid}`,
    );
}
console.log(
  "\nNext: record the sync baseline so later edits can be attributed to a side:\n" +
    `  node .claude/ticket-planner/sync.mjs --adopt --input ${args.input} --state ${statePath}`,
);
