---
name: sync-tickets
description: Use when the planner's local tickets and the Asana board may have drifted — "sync the tickets", "I edited WEB-CTA-3 in Asana", "did the tickets change", "pull the board changes down". Also before implementing a ticket whose row looks stale, and after hand-editing a tickets.jsonl. Two-way sync between .claude/ticket-planner/dry-runs/*/tickets*.jsonl and the board.
---

# Sync tickets with Asana

The dry-run JSONL and the Asana board are two copies of the same tickets. Both get edited —
the JSONL when a plan is revised in the repo, Asana when something is corrected on the board.
`sync.mjs` reconciles them **field by field**, in whichever direction the change came from.

Nothing is written until you pick a direction. There is no auto-merge.

## The model

`state.json` carries a `sync` baseline: a hash of every field as it stood on **both** sides
at the last sync. That is what makes direction knowable rather than guessed.

| Field state | Meaning | Fixed by |
|---|---|---|
| `in-sync` | both sides agree | — |
| `push →` | only the local file moved since the baseline | `--push` |
| `pull ←` | only Asana moved since the baseline | `--pull` |
| `conflict !!` | both moved, to different values | you pick, then `--force` |
| `diverged ??` | they differ and there is no baseline to attribute it to | you pick, then `--force` |

Synced fields: `summary` (task name), `description_markdown` (html_notes), `labels` (tags),
`priority`, `story_points` (the two custom fields).

**Never synced, in either direction:** section/column, completion, assignee, parent,
dependencies. Workflow state belongs to Asana alone — the scripts only ever read it.

## Commands

All take `--input <tickets*.jsonl>`; `--state` defaults to `<input-dir>/state.json`, so pass
it explicitly for dated folders. `ASANA_TOKEN` must be set.

```bash
S=.claude/ticket-planner/sync.mjs
D=.claude/ticket-planner/dry-runs/<slug>

node $S --status   --input $D/tickets-MMDDYYYY.jsonl --state $D/state-MMDDYYYY.json
node $S --adopt    --input … --state …      # record the baseline (nothing else changes)
node $S --pull     --input … --state …      # Asana → JSONL, for fields marked pull
node $S --push     --input … --state …      # JSONL → Asana, for fields marked push
node $S --pull-new --input … --state …      # adopt tasks created straight on the board
```

Scope any mode with `--keys WEB-CTA-3,WEB-CTA-4` (planner IDs). Add `--force` to
resolve conflicts/diverged in that mode's direction — always together with `--keys`, never
board-wide.

## Procedure

1. **`--status` first, always.** Read the per-field diff before deciding anything.
2. **First run on a folder that predates sync** reports everything as `diverged` because
   there is no baseline. If status shows no differences, just `--adopt`. If it shows
   differences, resolve them one at a time with `--keys … --force`, then `--adopt`.
3. **Clean drift**: `--pull` then `--push`. Pull first — pulling is how you find out what
   changed under you, and a push of unrelated fields can't clobber it (each mode writes only
   the fields it is responsible for).
4. **Conflicts**: show the user both values and ask which wins. Then
   `--push --keys … --force` (local wins) or `--pull --keys … --force` (Asana wins).
   Never resolve a conflict silently.
5. **Re-run `--status`** and confirm zero drift before moving on.

## Adopting tasks created directly in Asana

`--pull-new` finds subtasks of mapped epics/stories that have no local row, mints the next
`local_id` in the series, and appends them to the JSONL. It cannot know dependencies —
`blocks` / `blocked_by` come back empty. Fill those in, update `recommended-order.md` and
`asana-map.md`, then `--adopt`.

Tasks under an *unmapped* parent aren't found. A whole new epic belongs in its own dry-run
folder (`plan-tickets`), not bolted onto an existing one.

## Limits worth knowing

- **Markdown is a subset.** Descriptions round-trip through `html_notes`. Tables, nested
  lists, images and task lists don't survive; keep descriptions inside the subset listed in
  `plan-tickets`. Drift reported on a ticket nobody touched usually means its description
  strayed outside the subset.
- **Paragraph wrapping collapses.** A hand-wrapped paragraph in the JSONL becomes one line
  after a pull. Cosmetic, and comparison already accounts for it — an untouched ticket never
  reports drift.
- **`[gone]`** means the GID is in `state.json` but the task 404s (deleted or moved). The
  local row is left alone; decide whether to delete it or re-create the task.
- Story points only apply to Stories; on any other type both sides read as `null`.

## When to run it

- Before implementing a ticket (`work-ticket` step 3).
- After hand-editing a `tickets*.jsonl` — push it rather than leaving the board stale.
- After anyone edits tickets in the Asana UI.
- Right after a `replay.mjs` run — `--adopt` to establish the baseline.
