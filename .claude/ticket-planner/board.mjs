#!/usr/bin/env node
// Read the Asana board. READ-ONLY — nothing here ever writes.
//
//   node board.mjs [--stale <days>] [--section <name>] [--tag <name>]
//
// Prints the project's incomplete tasks grouped by section, with the planner ID
// reverse-looked-up from the dry-run state files, then a footer of per-section
// counts, stale tasks and stories missing estimates.
//
// Sections and completion are workflow state: this script reads them and
// nothing in .claude/ticket-planner/ ever writes them. Moving a card is a human
// action, on purpose.

import fs from "node:fs";
import path from "node:path";

import {
  CONFIG,
  die,
  getAll,
  parseArgs,
  readPriority,
  readStoryPoints,
  requireConfig,
  TASK_OPT_FIELDS,
  token,
} from "./asana.mjs";

const args = parseArgs(process.argv.slice(2), ["help"]);

if (args.help) {
  console.log(
    "board.mjs — read-only board readout\n\n" +
      "  --stale <days>     flag tasks untouched this long (default 7)\n" +
      "  --section <name>   only this section (substring, case-insensitive)\n" +
      "  --tag <name>       only tasks carrying this tag (substring)\n",
  );
  process.exit(0);
}

const staleDays = Number(args.stale ?? 7);
if (!Number.isFinite(staleDays) || staleDays < 0) die(`--stale needs a number of days`);

token();
requireConfig(["PROJECT_GID"]);

// ---------------------------------------------------------------------------
// planner ID ← GID, from every dry-run state file
// ---------------------------------------------------------------------------

const DRY_RUNS_DIR = path.join(import.meta.dirname, "dry-runs");

/**
 * GID → { localId, type }, assembled from every dry-run folder.
 *
 * The type comes from the tickets JSONL, not from Asana: Asana has no notion of
 * Epic/Story/Sub-task, so "stories missing an estimate" is only answerable from
 * the planner's own rows. Without it an Epic — which never carries points —
 * reads as unestimated.
 */
function loadPlannerIds() {
  const byGid = new Map();
  if (!fs.existsSync(DRY_RUNS_DIR)) return byGid;

  for (const folder of fs.readdirSync(DRY_RUNS_DIR)) {
    const dir = path.join(DRY_RUNS_DIR, folder);
    if (!fs.statSync(dir).isDirectory()) continue;

    const files = fs.readdirSync(dir);
    const typeByLocalId = new Map();

    for (const file of files) {
      if (!/^tickets.*\.jsonl$/.test(file)) continue;
      const contents = fs.readFileSync(path.join(dir, file), "utf8");
      for (const line of contents.split("\n")) {
        if (!line.trim()) continue;
        try {
          const ticket = JSON.parse(line);
          if (ticket.local_id) typeByLocalId.set(ticket.local_id, ticket.type);
        } catch {
          // A malformed row is replay.mjs's problem to report, not the board's.
        }
      }
    }

    for (const file of files) {
      if (!/^state.*\.json$/.test(file)) continue;
      let state;
      try {
        state = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      } catch {
        console.warn(`  ! ${folder}/${file} is not valid JSON; skipping`);
        continue;
      }
      for (const [localId, entry] of Object.entries(state.issues ?? {})) {
        // GIDs are strings. Keyed as-is, compared with ===.
        if (entry?.gid) {
          byGid.set(entry.gid, { localId, type: typeByLocalId.get(localId) ?? null });
        }
      }
    }
  }

  return byGid;
}

const plannerIds = loadPlannerIds();

// ---------------------------------------------------------------------------
// Read the board
// ---------------------------------------------------------------------------

const sections = await getAll(`/projects/${CONFIG.PROJECT_GID}/sections`, {
  opt_fields: "name",
});

const allTasks = await getAll("/tasks", {
  project: CONFIG.PROJECT_GID,
  opt_fields: TASK_OPT_FIELDS,
});

const openTasks = allTasks.filter((task) => !task.completed);

function sectionNameOf(task) {
  const membership = (task.memberships ?? []).find(
    (candidate) => candidate.section?.name,
  );
  return membership?.section?.name ?? "(no section)";
}

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

const filtered = openTasks.filter((task) => {
  if (args.section) {
    const name = sectionNameOf(task).toLowerCase();
    if (!name.includes(args.section.toLowerCase())) return false;
  }
  if (args.tag) {
    const wanted = args.tag.toLowerCase();
    const has = (task.tags ?? []).some((tag) =>
      tag.name.toLowerCase().includes(wanted),
    );
    if (!has) return false;
  }
  return true;
});

// ---------------------------------------------------------------------------
// Print, grouped by section in board order
// ---------------------------------------------------------------------------

const orderedSectionNames = [
  ...sections.map((section) => section.name),
  "(no section)",
];

const grouped = new Map(orderedSectionNames.map((name) => [name, []]));
for (const task of filtered) {
  const name = sectionNameOf(task);
  if (!grouped.has(name)) grouped.set(name, []);
  grouped.get(name).push(task);
}

console.log(`Board: project ${CONFIG.PROJECT_GID}`);
console.log(
  `${filtered.length} open task(s)` +
    (filtered.length === openTasks.length ? "" : ` of ${openTasks.length} (filtered)`),
);
console.log("");

const stale = [];
const unestimated = [];

for (const [sectionName, tasks] of grouped) {
  if (tasks.length === 0) continue;

  console.log(`${sectionName}  (${tasks.length})`);

  for (const task of tasks) {
    const planner = plannerIds.get(task.gid);
    const plannerId = planner?.localId ?? "—";
    const points = readStoryPoints(task);
    const priority = readPriority(task);
    const age = daysSince(task.modified_at);

    if (age !== null && age > staleDays) stale.push({ task, plannerId, age });
    // Only Stories carry estimates. Epics and Sub-tasks legitimately have none.
    if (planner?.type === "Story" && points === null) {
      unestimated.push({ task, plannerId });
    }

    const parts = [
      plannerId.padEnd(14),
      (points === null ? "—" : String(points)).padStart(3),
      `${age === null ? "?" : age}d`.padStart(5),
      (priority ?? "—").padEnd(3),
      task.name,
    ];
    console.log(`  ${parts.join("  ")}`);
  }

  console.log("");
}

console.log("─".repeat(72));
console.log("Section counts");
for (const [sectionName, tasks] of grouped) {
  if (tasks.length === 0) continue;
  console.log(`  ${sectionName.padEnd(24)} ${String(tasks.length).padStart(3)}`);
}

console.log(`\nStale (untouched > ${staleDays}d): ${stale.length}`);
for (const { task, plannerId, age } of stale) {
  console.log(`  ${plannerId.padEnd(14)} ${age}d  ${task.name}`);
}

console.log(`\nStories with no estimate: ${unestimated.length}`);
for (const { task, plannerId } of unestimated) {
  console.log(`  ${plannerId.padEnd(14)} ${task.name}`);
}

const unknown = filtered.filter((task) => !plannerIds.has(task.gid)).length;
if (unknown > 0) {
  console.log(
    `\n${unknown} open task(s) have no planner ID — created outside the planner.\n` +
      "  Adopt the ones under a mapped parent with `sync.mjs --pull-new`.",
  );
}

if (!CONFIG.STORY_POINTS_FIELD_GID || !CONFIG.PRIORITY_FIELD_GID) {
  console.log(
    "\nNote: running in degraded mode — " +
      [
        CONFIG.PRIORITY_FIELD_GID ? null : "Priority",
        CONFIG.STORY_POINTS_FIELD_GID ? null : "Story Points",
      ]
        .filter(Boolean)
        .join(" and ") +
      " is not configured, so that column reads as —.",
  );
}
