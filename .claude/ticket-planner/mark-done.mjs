#!/usr/bin/env node
// Record merged tickets in the planner's LOCAL files. Writes nothing to Asana
// (the asana-sync workflow owns the Asana side; this script owns the repo side
// of the same event, so the two stay in step).
//
//   node mark-done.mjs --keys WEB-POKE-1.1[,WEB-POKE-1.2] [--pr <url>]
//
// For each key it finds the dry-run folder whose tickets*.jsonl defines it,
// then:
//   1. state*.json — stamps issues[key] with status: "done", done_at and
//      (when given) done_pr. sync.mjs only reads .gid, so the extra fields
//      never register as drift.
//   2. recommended-order.md — prefixes done sub-task lines with ✅ and
//      recomputes each story bullet's emoji: ✅ when the story (or all of its
//      sub-tasks) is done, ▶️ when every blocked_by is done, ⏳ otherwise.
//
// Idempotent: re-running with the same keys changes nothing. Unknown keys are
// reported and skipped without failing the run, so callers can pass everything
// that looks like a planner ID.

import fs from "node:fs";
import path from "node:path";

import { die, parseArgs } from "./asana.mjs";

const args = parseArgs(process.argv.slice(2), ["help"]);

if (args.help || !args.keys) {
  console.log(
    "mark-done.mjs — record merged tickets in state*.json and recommended-order.md\n\n" +
      "  --keys <id[,id…]>   planner IDs to mark done (required)\n" +
      "  --pr <url>          PR that finished the work, stored as done_pr\n",
  );
  process.exit(args.help ? 0 : 1);
}

const keys = String(args.keys)
  .split(/[,\s]+/)
  .filter(Boolean);
if (keys.length === 0) die("--keys is empty");

const DRY_RUNS_DIR = path.join(import.meta.dirname, "dry-runs");
const KEY_RE = /[A-Z][A-Z0-9-]*-\d+(?:\.\d+)?/;

// ---------------------------------------------------------------------------
// Load every dry-run folder once: rows, state files, recommended-order.md
// ---------------------------------------------------------------------------

function loadFolder(dir) {
  const rowByKey = new Map();
  for (const file of fs.readdirSync(dir)) {
    if (!/^tickets.*\.jsonl$/.test(file)) continue;
    for (const line of fs
      .readFileSync(path.join(dir, file), "utf8")
      .split("\n")) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (row.local_id) rowByKey.set(row.local_id, row);
      } catch {
        // tolerated: sync.mjs is the tool that complains about bad JSONL
      }
    }
  }

  const stateFiles = fs
    .readdirSync(dir)
    .filter((file) => /^state.*\.json$/.test(file))
    .map((file) => path.join(dir, file));

  return { dir, rowByKey, stateFiles };
}

const folders = fs.existsSync(DRY_RUNS_DIR)
  ? fs
      .readdirSync(DRY_RUNS_DIR)
      .map((name) => path.join(DRY_RUNS_DIR, name))
      .filter((dir) => fs.statSync(dir).isDirectory())
      .map(loadFolder)
  : [];

// ---------------------------------------------------------------------------
// 1. Stamp the state files
// ---------------------------------------------------------------------------

const today = new Date().toISOString().slice(0, 10);
const touchedFolders = new Set();
const unknown = [];

for (const key of keys) {
  const folder = folders.find((candidate) => candidate.rowByKey.has(key));
  if (!folder) {
    unknown.push(key);
    continue;
  }

  let stamped = false;
  for (const stateFile of folder.stateFiles) {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    const entry = state.issues?.[key];
    if (!entry) continue;
    if (entry.status !== "done") {
      entry.status = "done";
      entry.done_at = today;
      if (args.pr) entry.done_pr = String(args.pr);
      fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n");
      console.log(
        `${key}: marked done in ${path.relative(process.cwd(), stateFile)}`,
      );
    } else {
      console.log(`${key}: already done`);
    }
    stamped = true;
    touchedFolders.add(folder);
  }
  if (!stamped)
    console.log(
      `${key}: defined in ${path.basename(folder.dir)} but never replayed — skipped`,
    );
}

if (unknown.length > 0)
  console.log(`No planner row found for: ${unknown.join(", ")} — skipped`);

// ---------------------------------------------------------------------------
// 2. Recompute recommended-order.md in every touched folder
// ---------------------------------------------------------------------------

function rewriteRecommendedOrder(folder) {
  const orderPath = path.join(folder.dir, "recommended-order.md");
  if (!fs.existsSync(orderPath)) return;

  const doneByState = new Set();
  for (const stateFile of folder.stateFiles) {
    const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    for (const [key, entry] of Object.entries(state.issues ?? {})) {
      if (entry.status === "done") doneByState.add(key);
    }
  }

  const childrenByParent = new Map();
  for (const row of folder.rowByKey.values()) {
    if (!row.parent_local_id) continue;
    if (!childrenByParent.has(row.parent_local_id))
      childrenByParent.set(row.parent_local_id, []);
    childrenByParent.get(row.parent_local_id).push(row.local_id);
  }

  function isDone(key) {
    if (doneByState.has(key)) return true;
    const children = childrenByParent.get(key) ?? [];
    return children.length > 0 && children.every(isDone);
  }

  function isReady(key) {
    return (folder.rowByKey.get(key)?.blocked_by ?? []).every(isDone);
  }

  const storyLine = new RegExp(
    `^(\\s*-\\s*)(✅|▶️|⏳)(\\s+\\*\\*(${KEY_RE.source})\\*\\*)`,
    "u",
  );
  const subTaskLine = new RegExp(
    `^(\\s*\\d+\\.\\s+)(✅\\s+)?(${KEY_RE.source})\\b`,
  );

  const lines = fs.readFileSync(orderPath, "utf8").split("\n");
  let changed = false;

  const rewritten = lines.map((line) => {
    const story = line.match(storyLine);
    if (story) {
      const emoji = isDone(story[4]) ? "✅" : isReady(story[4]) ? "▶️" : "⏳";
      if (emoji === story[2]) return line;
      changed = true;
      return line.replace(storyLine, `$1${emoji}$3`);
    }
    const sub = line.match(subTaskLine);
    if (sub && isDone(sub[3]) && !sub[2]) {
      changed = true;
      return line.replace(subTaskLine, "$1✅ $3");
    }
    return line;
  });

  if (changed) {
    fs.writeFileSync(orderPath, rewritten.join("\n"));
    console.log(`updated ${path.relative(process.cwd(), orderPath)}`);
  }
}

for (const folder of touchedFolders) rewriteRecommendedOrder(folder);
