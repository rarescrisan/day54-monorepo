---
name: work-ticket
description: Use when asked to implement, start, or pick up a ticket by planner ID or Asana link — "work WEB-CTA-3", "implement the next ticket", "what's ready to pick up". Resolves the ID to its planner row and design context, checks its blockers, and drives implementation against the ticket's own acceptance criteria.
---

# Work a ticket

A ticket reference is not the ticket. The ticket is a row in a dry-run JSONL, and its meaning
depends on the folder's README (which records design decisions and reversals) and on the
tickets that block it. Reading the Asana task alone is how you build the thing that was
already reverted.

**Never guess what a ticket means.** Resolve it.

## 1. Resolve the reference

By planner ID (the normal case — `WEB-CTA-3`):

```bash
grep -l '"WEB-CTA-3"' .claude/ticket-planner/dry-runs/*/tickets*.jsonl
jq -r 'select(.local_id=="WEB-CTA-3")' <that file>
```

By Asana URL: extract the task GID from the permalink and grep the state files for it, then
read the row for the local ID it maps to:

```bash
grep -l '<gid>' .claude/ticket-planner/dry-runs/*/state*.json
```

If neither finds anything, the task was created outside the planner — adopt it with
`sync.mjs --pull-new` (if it hangs off a mapped parent) or ask.

## 2. Load the context around it, in this order

| Read | For |
|---|---|
| The JSONL row | Context / Requirements / Acceptance, points, labels |
| Its sub-task rows (`parent_local_id == <id>`) | The implementation checklist |
| `<dir>/README.md` | **Design decisions and pivots.** A story can be superseded while still open. |
| `<dir>/recommended-order.md` | Where it sits in the build order, what it unblocks |
| The RFC / handoff the README cites | The contract being implemented |
| `docs/architecture/` (if present) | How the app fits together |

If the README says the approach was reversed, stop and confirm with the user before building
the superseded design.

## 3. Confirm the local row still matches Asana

```bash
node .claude/ticket-planner/sync.mjs --status --keys WEB-CTA-3 \
  --input <dir>/tickets*.jsonl --state <dir>/state*.json
```

Anything other than in-sync means someone edited the ticket on one side. Resolve it with
`sync-tickets` before writing code — the acceptance criteria you are about to implement
against may be stale.

(Needs `ASANA_TOKEN`. If it isn't set, say so and continue — just note in your report that
the row wasn't verified against Asana.)

## 4. Check the blockers

For each `blocked_by` entry, check whether it actually landed:

```bash
git log --oneline --grep 'WEB-CTA-1'                    # did it ship here?
node .claude/ticket-planner/board.mjs | grep 'WEB-CTA-1' # what column is it in?
```

If a blocker is unfinished, say so and ask before proceeding. Some blockers are soft (the
dependency is a type that already exists); say which kind you found rather than assuming.

## 5. Plan against the ticket's own acceptance criteria

Invoke `clarify-and-plan`. The success criteria are the `## Acceptance` bullets **verbatim** —
do not paraphrase them into something easier. If a bullet isn't checkable as written, say so
now and propose the check you'll actually run.

State any assumption the ticket leaves open (the README's "open questions" is where these
usually hide).

## 6. Implement

Branch first — `feat/<descriptive-slug>` (branch names are descriptive, not ticket-keyed;
the ticket ID goes in the commit subject). Then the normal discipline:

`explore-before-coding` → `respect-the-layers` → `complete-the-wiring` → `surgical-diffs` →
`test-like-a-user`.

Work the sub-tasks in order; they were written as the implementation sequence.

## 7. Verify, then report

Run every acceptance bullet (`verify-before-done`). Report as a table — criterion, the command
you ran, the result. A bullet you couldn't check is reported as unchecked, not as passing.

Then stop. Do not commit, push, or open a PR unless asked.

## 8. When the user asks to commit

- Conventional commit, planner ID in the scope: `feat(WEB-CTA-3): add CTA deep-link handling`
  — that ID is how `kanban-review` later matches PRs to tickets.
- **Explicit pathspecs** — `git add` the files you changed, never `git add -A`.
- Breaking changes: `type!:` subject (preferred) or a `BREAKING CHANGE:` body line.
- Pre-push runs lint + typecheck + tests; expect a minute or two.
- PRs target `develop`, not `main`.

Asana column moves are not automated — move the card yourself. Nothing in
`.claude/ticket-planner/` ever writes status, assignee, or completion.
