---
name: plan-tickets
description: Use when turning a PRD, RFC, handoff doc, or design decision into Asana tasks on the Web Skeleton board — "break this RFC into tickets", "plan the work for X", "create tickets for this doc". Produces a reviewable dry-run folder first, then replays it into Asana with replay.mjs. Not for implementing a ticket that already exists (that is work-ticket).
---

# Plan tickets

Planning happens **on disk first**. Every initiative becomes a dry-run folder under
`.claude/ticket-planner/dry-runs/<slug>/` that is reviewed, corrected, and only then
replayed into Asana. The JSONL stays the editable source of record afterwards —
`sync-tickets` keeps it and Asana aligned.

Never create Asana tasks by hand or one at a time. `replay.mjs` is the only write path,
and it is resumable: re-running after a failure picks up where it stopped.

## Fixed facts — do not re-derive these

The workspace, project, assignee, and custom-field GIDs are hardcoded in
`.claude/ticket-planner/asana.mjs` (established once via `--setup`). Credentials come from
the `ASANA_TOKEN` env var — a personal access token, never written to the repo.

There is no sprint and no point budget. Points are estimated for forecasting only.

## Procedure

### 1. Read everything first

Read every file in the source folder — PRD, RFC, meeting notes, transcripts, handoff docs.
Note explicitly: what is in scope, what is out, what is NOT FINALIZED, and any decision the
user made that **deviates from the written doc**. That last one matters most — the doc is
not automatically the plan, and the deviation is what future readers will need explained.

### 2. Create the dry-run folder

```
.claude/ticket-planner/dry-runs/<initiative-slug>/
├── tickets-MMDDYYYY.jsonl    # the tickets (required)
├── state-MMDDYYYY.json       # {"issues":{},"homed":[],"links":[]} — replay fills it
├── README.md                 # origin, decisions, open questions, how to replay
├── recommended-order.md      # dependency-aware build order
└── asana-map.md              # planner ID ↔ Asana permalink table
```

Undated `tickets.jsonl` / `state.json` is fine for a single-ticket folder. If you date one,
date both — `replay.mjs` defaults the state path to `<input-dir>/state.json`, so a dated
tickets file needs an explicit `--state`.

### 3. Write the tickets

One JSON object per line. Keys by type:

| Field                                  |        Epic        |        Story         | Sub-task |
| -------------------------------------- | :----------------: | :------------------: | :------: |
| `local_id`                             |         ✓          |          ✓           |    ✓     |
| `type` (`Epic` / `Story` / `Sub-task`) |         ✓          |          ✓           |    ✓     |
| `summary`                              |         ✓          |          ✓           |    ✓     |
| `priority` (`P1`–`P5`)                 |         ✓          |          ✓           |    ✓     |
| `labels` (string[])                    |         ✓          |          ✓           |    ✓     |
| `story_points`                         | sum of its stories | sum of its sub-tasks |   1–3    |
| `description_markdown`                 |         ✓          |          ✓           |    ✓     |
| `epic_local_id`                        |         —          |          ✓           |    —     |
| `parent_local_id`                      |         —          |          —           |    ✓     |
| `blocks` / `blocked_by` (local ids)    |         —          |          ✓           |    —     |

`local_id` uses a short initiative tag: `WEB-CTA-E1` (epic), `WEB-CTA-1` (story),
`WEB-CTA-1.2` (sub-task of story 1). **Asana has no issue keys, so after replay the
local ID is the ticket's permanent name** — it goes in commit scopes and PR titles.
`state.json` maps it to the task GID and permalink.

Summaries take an optional layer prefix for board filtering: `[FE]`, `[API]`, `[INFRA]`,
`[QA]`, `[DOCS]`. Omit when the work doesn't split by layer.

**Granularity.** A story is the smallest independently shippable, testable unit — if a
story's requirements bundle two things that could merge separately, split it. Then break
every story of 2+ points into sub-tasks: one per mechanical step (a file to create, a
dependency to add, a config wiring point, a test file), typically 3–6 per story. A story
needing more than 6 is a story to split, not a longer checklist. Sub-tasks are how
progress becomes visible mid-story and how `work-ticket` gets a checklist — a plan whose
stories have no sub-tasks is almost always too coarse.

**Story description template** — three sections, written dense enough that an
implementer can code against the ticket without reopening the source doc:

- **Context** — a few packed lines, not a paragraph of scene-setting: the source-doc
  section this implements (`RFC §6.3`), the closest existing code it mirrors and the
  one-line way this differs from it, the behavioral posture in one sentence
  ("failures shed silently, never retry, never throw into the inbox query"), and the
  exact path of the primary artifact.
- **Requirements** — one bullet per behavior, at code-against precision:
  - Exact outcome per case, never a category: "On 429: log the `Retry-After` header
    at warn, return `null` — no retry, no sleep", not "handle rate limiting".
  - Name mechanisms and sources exactly: "native fetch with a 5s `AbortController`
    timeout", "all from `ConfigKey.ZENDESK` — never `process.env`".
  - State negative constraints in the bullet where they'd be violated, **with the
    reason**: a prohibition without its why gets optimized away by a later reader.
  - Where behavior deviates from the mirrored code, say so explicitly ("unlike the
    CIO client, which logs bodies at debug").
  - Enumerate the exact surface the consumer needs (methods, endpoints, params) and
    name wiring points as files ("new event constant in
    `common/constants/alert.constants.ts`").
- **Acceptance** — what `work-ticket` later verifies against: every bullet checkable
  by a command or observable outcome, not an intention.
  - Coverage living in another ticket is fine — name it by planner ID plus the
    scenarios it must prove.
  - Every negative constraint gets a mechanical check ("`git grep` of the client
    shows no logging of response bodies or emails").
  - End with the repo gates that must pass (lint/typecheck/test commands).

Exemplar (borrowed from another codebase — copy the density, not the stack):

```markdown
## Context

RFC §6.3. Thin fetch wrapper mirroring `CustomerIoHttpClient`, but hardened for an
account-wide rate limit: failures shed silently, never retry, never throw into the
inbox query. Lives at
`apps/api/src/modules/inbox-support/services/zendesk-http.client.ts`.

## Requirements

- Basic auth as `{email}/token:{api_token}` against `https://{subdomain}.zendesk.com`
  (all from `ConfigKey.ZENDESK` — never `process.env`).
- Native fetch with a 5s `AbortController` timeout on every request.
- On 429: log the `Retry-After` header at warn, return `null` — no retry, no sleep.
- On any non-2xx or timeout: log and return `null`.
- Logging: new event constant in `common/constants/alert.constants.ts`; NEVER log
  the user email or any response body — ticket payloads contain customer-written
  support text (unlike the CIO client, which logs bodies at debug). Log `ticket_id`
  / `comment_id` only.
- Methods for the four calls the adapter needs: user search by `external_id`, user
  search by email query, `PUT /api/v2/users/{id}.json` (external_id write-back),
  requested-tickets list, ticket comments (the latter two with the query params
  from RFC §6.2).

## Acceptance

- Covered by the adapter/poll integration specs (NS-ZD-11) against wiremock: 429,
  timeout, and 5xx responses all produce null/no-op without throwing.
- `git grep` of the client shows no logging of response bodies or emails.
- Lint passes (no-console, no `any`, explicit return types).
```

Sub-task descriptions are one or two lines at the same precision — the file to touch,
the shape of the change, and any negative constraint that sub-task alone could violate.

**Markdown subset.** Descriptions are converted to Asana `html_notes` by `asana.mjs`.
Supported: headings, paragraphs, `-`/`*` bullets, `1.` ordered lists, `---` rules, and
inline `` `code` ``, `**bold**`, `[text](url)`. **Not** supported: tables, nested lists
(flattened one level), images, task lists. Stick to the subset — anything outside it
degrades on the way to Asana and again on every sync.

### 4. Write the supporting docs

- **README.md** — origin (which doc, which ticket), the design decision that shaped the
  breakdown and _why_, locked decisions, open questions, file table, replay command, forecast
  total, critical path. If the plan deviates from the source doc, say so at the top.
- **recommended-order.md** — build order in waves, computed from `blocked_by`/`blocks`, with
  each ticket's dependencies named. Status legend (✅ done · ▶️ ready · ⏳ blocked).
- **asana-map.md** — permalink ↔ local-id tables for epic, stories, sub-tasks. `_(pending)_`
  until replay, then backfilled.

### 5. Present for approval — do not skip

Show a table: local id, summary, points, priority, blockers. Plus the forecast total and the
critical path. **Wait for approval before running anything against Asana.** Corrections are
free on disk and expensive after 44 tasks exist.

### 6. Replay

```bash
ASANA_TOKEN=… node .claude/ticket-planner/replay.mjs \
  --input .claude/ticket-planner/dry-runs/<slug>/tickets-MMDDYYYY.jsonl \
  --state .claude/ticket-planner/dry-runs/<slug>/state-MMDDYYYY.json
```

Four passes: Epics → Stories (created as subtasks of their epic, then multi-homed into the
project so they appear on the board) → dependencies → Sub-tasks (parented at create, not
multi-homed). State is saved after every single call, so a crash costs nothing; re-run the
identical command to resume.

First time against a fresh setup, prove the credentials with `--smoke` (creates one
throwaway task you then delete).

### 7. After replay

1. Backfill permalinks into `asana-map.md` and the status markers in `recommended-order.md`.
2. **Record the sync baseline** so later edits on either side can be attributed:
   ```bash
   node .claude/ticket-planner/sync.mjs --adopt --input <tickets.jsonl> --state <state.json>
   ```
3. Report the created tickets (local IDs + permalinks), the epic, forecast total, and links.

## Conventions

|              |                                                                                                                                                                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Priority     | P1 blockers/core · P2 important · P3 standard · P4 minor · P5 tech debt                                                                                                                                                                                                                               |
| Points       | Estimate bottom-up and ladder up: each sub-task carries 1–3 points, a story's points is the exact sum of its sub-tasks, an epic's points is the exact sum of its stories. A story summing above 8 should be split. (A story with no sub-tasks — rare, see Granularity — estimates directly at 1/2/3.) |
| Labels       | layer (`frontend`, `api`, `infra`, `qa`, `docs`) + feature tags. Sub-tasks also carry `subtask`.                                                                                                                                                                                                      |
| Dependencies | schema → API, API → consumer, implementation → tests: express as `blocked_by` on the dependent story; `replay.mjs` dedupes both directions into one edge.                                                                                                                                             |

## Gotchas

1. **Stories must be multi-homed to be board-visible.** An Asana subtask does not appear in
   the project unless explicitly added — replay pass 2 handles it; never "fix" a missing card
   by dragging in the UI without checking the state file.
2. **`html_notes` rejects tags outside the supported subset** with a 400. Keep descriptions
   inside the markdown subset above.
3. **Don't renumber `local_id`s after a replay.** The state file maps by local id — renumbering
   orphans every task. Append new ids instead.
4. **Don't re-plan a superseded ticket by editing history.** When a decision reverses, add a
   new ticket that does the removal and mark the old ones superseded. The board is a record of
   what happened.
5. **Do not create tickets for work owned by other teams.** Note the dependency in the README instead.
