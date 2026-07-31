# Asana ticket planner

Plans tickets on disk first, then replays them into Asana. Four scripts, no npm
dependencies, Node ≥ 20.11 (uses `import.meta.dirname`).

The design in one paragraph: **planning happens in a reviewable folder on disk**;
`replay.mjs` is the only write path for creation and is resumable after any
failure; `sync.mjs` reconciles field-level drift in *whichever direction it came
from*, against a recorded baseline, and never auto-merges; `board.mjs` reads the
board and never writes. Workflow state — sections, completion, assignee — is
never automated. Moving a card is a human action.

---

## Setup

### 1. Create a personal access token

Asana → your profile photo → **My Settings → Apps → Manage Developer Apps** →
*Create new personal access token* (or <https://app.asana.com/0/my-apps>).

Export it for your shell only. Never write it to a file in this repo, never pass
it on a command line that lands in shell history, never echo it in CI logs:

```bash
export ASANA_TOKEN='…'
```

Every script exits `2` with an explanation if `ASANA_TOKEN` is missing.

### 2. Discover the fixed identifiers

```bash
node .claude/ticket-planner/asana.mjs --setup
```

It walks you through: pick a workspace → pick the project that is the board →
choose whether new tasks are assigned to you → read the project's custom fields.
If **Priority** or **Story Points** are missing it offers to create them.

It finishes by printing a `CONFIG` block. **Paste it over the `CONFIG` block at
the top of `asana.mjs`.** These identifiers are hardcoded on purpose: they are
stable for the life of the board, and hardcoding them means no script ever has
to re-discover them or leave you wondering which project a run wrote to.

### 3. Prove it end to end

```bash
node .claude/ticket-planner/replay.mjs --smoke
```

Creates one throwaway task in the project and prints its permalink. Delete it in
the Asana UI — nothing tracks it.

---

## Fixed identifiers

Filled in by `--setup`. Until then every script exits `2` and points you at it.

| Constant | What it is | Value |
|---|---|---|
| `WORKSPACE_GID` | The Asana workspace | _(run `--setup`)_ |
| `PROJECT_GID` | The project used as the board | _(run `--setup`)_ |
| `DEFAULT_ASSIGNEE_GID` | Who new tasks go to; `null` = unassigned | _(run `--setup`)_ |
| `PRIORITY_FIELD_GID` | The **Priority** single-select custom field | _(run `--setup`)_ |
| `PRIORITY_OPTION_GIDS` | Its five enum options, `P1`–`P5` | _(run `--setup`)_ |
| `STORY_POINTS_FIELD_GID` | The **Story Points** number custom field | _(run `--setup`)_ |

GIDs are **strings**. Asana GIDs exceed 2^53 and are documented as opaque —
never `parseInt` them, never compare with `==`.

### Degraded mode (free Asana tier)

Custom fields and task dependencies are paid features. Leaving
`PRIORITY_FIELD_GID` or `STORY_POINTS_FIELD_GID` as `null` is a **supported
configuration**, not a broken one:

- that field is neither written to Asana nor synced; it lives in the JSONL only
- `replay.mjs` reports the degraded fields at startup so you can't forget
- dependency creation failures are caught per-edge: the tasks still get created,
  and the edge stays in the JSONL
- encode what you lose as tags instead — `P1`…`P5`, `pts:1`…`pts:13` — and add a
  literal `Blocked by WEB-…` line at the top of the description

---

## Layout

```
.claude/ticket-planner/
├── asana.mjs                REST client, markdown ⇄ html_notes, field builders, state I/O
├── replay.mjs               Create tasks from a dry-run JSONL (resumable)
├── sync.mjs                 Two-way field-level sync
├── board.mjs                Read the board (read-only)
├── asana-planner-guide.md   This file
└── dry-runs/<slug>/
    ├── tickets-MMDDYYYY.jsonl   the tickets
    ├── state-MMDDYYYY.json      local_id → GID/permalink, progress, sync baseline
    ├── README.md                origin, design decisions, open questions
    ├── recommended-order.md     dependency-aware build order
    └── asana-map.md             planner ID ↔ Asana permalink table
```

The two markdown converters live in `asana.mjs` and **only** there. `sync.mjs`
detects drift by projecting both sides through the same conversion, so a second
copy that drifted would report phantom diffs on tickets nobody touched.

---

## Commands

```bash
# One-time discovery
node .claude/ticket-planner/asana.mjs --setup

# Create (the only write path for creation; resumable)
node .claude/ticket-planner/replay.mjs --smoke
node .claude/ticket-planner/replay.mjs --input <tickets.jsonl> [--state <state.json>]
node .claude/ticket-planner/replay.mjs --input <tickets.jsonl> --update WEB-CTA-3,WEB-CTA-4

# Reconcile
node .claude/ticket-planner/sync.mjs --status   --input <tickets.jsonl> [--state <state.json>]
node .claude/ticket-planner/sync.mjs --adopt    --input …
node .claude/ticket-planner/sync.mjs --pull     --input …
node .claude/ticket-planner/sync.mjs --push     --input …
node .claude/ticket-planner/sync.mjs --pull-new --input …
#   scope: --keys WEB-CTA-3,WEB-CTA-4      resolve: --force (requires --keys)

# Read
node .claude/ticket-planner/board.mjs [--stale 7] [--section "In Progress"] [--tag cta]
```

`--state` defaults to `<input-dir>/state.json`. If you date the tickets file,
date the state file too and pass `--state` explicitly.

### What replay does, in order

1. **Epics** — `POST /tasks` with `projects: [PROJECT]`.
2. **Stories** — `POST /tasks` with `parent` = the epic, then
   `POST /tasks/{gid}/addProject` to multi-home onto the board. Recorded
   separately in `state.homed`, because creation and board visibility fail
   independently.
3. **Dependencies** — `POST /tasks/{dependent}/addDependencies`. `blocks` and
   `blocked_by` are collapsed into one canonical edge, so declaring a pair from
   both ends creates one dependency.
4. **Sub-tasks** — `POST /tasks` with `parent` = the story. Deliberately **not**
   multi-homed: they are checklist items, not cards.

State is written to disk after **every** API call. A crash, a 429 storm or a
Ctrl-C costs nothing: re-run the identical command and it resumes exactly where
it stopped without double-creating anything.

### The sync model

`state.json` carries a `sync` baseline — the value of every synced field as it
stood on **both** sides at the last sync. That is what makes direction *knowable*
rather than guessed.

| Field state | Meaning | Fixed by |
|---|---|---|
| `in-sync` | both sides agree | — |
| `push →` | only the local file moved since the baseline | `--push` |
| `pull ←` | only Asana moved since the baseline | `--pull` |
| `conflict !!` | both moved, to different values | you pick, then `--keys … --force` |
| `diverged ??` | they differ and there is no baseline to attribute it to | you pick, then `--keys … --force` |

Synced: `summary` ↔ name, `description_markdown` ↔ html_notes, `labels` ↔ tags,
`priority` ↔ Priority, `story_points` ↔ Story Points (Stories only).

**Never synced in either direction:** section/column, `completed`, assignee,
parent, dependencies.

A push writes **only** the fields it is pushing, so one ticket can safely push
some fields and pull others. `--force` is only valid with `--keys` — resolving
conflicts board-wide would silently overwrite whichever side happened to lose.
`--adopt` records a baseline only for fields that currently agree; baselining a
field that still differs would launder a real conflict into "in-sync".

---

## Conventions

- **Local IDs are not task names.** `state.json` is the only mapping from
  `WEB-CTA-3` to a GID. Task names are editable and not unique — never identify
  a task by name. Never renumber local IDs after a replay; append instead.
- **The local ID is the ticket's permanent handle.** It goes in commit scopes and
  PR titles: `feat(WEB-CTA-3): …`. That is how `/kanban-review` matches PRs to
  tickets.
- **Priority**: P1 blockers/core · P2 important · P3 standard · P4 minor ·
  P5 tech debt.
- **Points**: 1/2/3/5/8/13, Stories only. Above 8 means split the story.
- **Labels**: layer (`frontend`, `api`, `infra`, `qa`, `docs`) plus feature tags;
  sub-tasks also carry `subtask`.
- **Never automated**: moving a card between sections, completing a task,
  changing an assignee. The scripts read these and never write them.

### The markdown subset

Descriptions are converted to Asana `html_notes`, an XML-ish subset. The
converter emits only tags verified against
<https://developers.asana.com/docs/rich-text>:

`body` `h1` `h2` `strong` `em` `code` `a href` `ol` `ul` `li` `pre` `hr/`

**Supported markdown:** `#`/`##` headings, paragraphs, `-`/`*` bullets, `1.`
ordered lists, `---` rules, ```` ``` ```` fenced code (→ `<pre>`), `**bold**`,
`*italic*`, inline `` `code` ``, `[text](url)`.

**Not supported**, and degraded on the way in:

| Markdown | What happens |
|---|---|
| `###` and deeper | rendered as `##` (Asana has h1 and h2 only) |
| Nested lists | flattened to one level — Asana rejects the nesting |
| Tables | dropped (supported in project briefs, not tasks) |
| Images, task lists | dropped |
| Hand-wrapped paragraphs | re-joined into one line |

Stay inside the subset. Anything outside it degrades on the way in and again on
every sync. The converters are **idempotent** — projecting twice equals
projecting once — which is what stops an untouched ticket from reporting drift.

---

## Known Asana quirks

| Quirk | How the planner handles it |
|---|---|
| A subtask is invisible on the board unless explicitly added to the project | Replay pass 2 multi-homes every Story; sub-tasks stay off-board by design |
| `html_notes` 400s on any tag outside the supported subset | The converter emits only the verified subset and escapes all user text; no HTML is ever passed through |
| Nesting `h1`/`h2`/`pre`/`blockquote` inside `<li>` is rejected | Nested markdown lists are flattened to one level |
| Custom fields and dependencies are paid-tier | Degraded mode above; `--setup` detects it, replay catches per-edge dependency failures |
| Task names are neither unique nor stable | Identity is `state.json` only |
| GIDs are strings, larger than `Number.MAX_SAFE_INTEGER` | Never parsed as numbers; compared with `===` |
| Rate limit: 429 with `Retry-After` | Client honours it and retries; every call is throttled to ~143/min, under the free tier's ~150 |
| Pagination via opaque `next_page.offset` | `getAll()` follows every page — an unfollowed page is silent truncation, and a half-read board looks like a complete one |
| Compact records by default | Every read passes `opt_fields` explicitly; a missing field is indistinguishable from an empty one and would corrupt a sync |
| No status field — a column is a section membership, "done" is `completed` | `board.mjs` reads both; nothing writes either |
| Tags are workspace-global | Create-or-reuse by exact name, cached per run |
| `PUT /tasks` cannot set tags | `labels` uses `addTag`/`removeTag` instead |

---

## Troubleshooting

**`✖ ASANA_TOKEN is not set`** — export it in this shell. Exit code 2 always
means "fix your environment", never a bug in the scripts.

**`✖ WORKSPACE_GID, PROJECT_GID not set`** — run `asana.mjs --setup` and paste
the printed `CONFIG` block into `asana.mjs`.

**401 from every call** — the token is wrong, revoked, or belongs to an account
without access to that workspace. Re-create it at
<https://app.asana.com/0/my-apps>.

**Replay stopped partway** — re-run the identical command. It resumes from
`state.json` and will not duplicate anything. Do not hand-edit the state file to
"help" it.

**A story exists but isn't on the board** — it was created but never multi-homed.
Check whether its local ID is in `state.homed`; re-running replay adds it. Don't
fix it by dragging in the UI without checking the state file, or the next replay
will disagree with the board.

**Everything reports `diverged ??`** — there is no baseline yet. If `--status`
shows no actual differences, just `--adopt`. If it shows differences, resolve
them one ticket at a time with `--keys … --force`, then `--adopt`.

**Drift on a ticket nobody touched** — its description strayed outside the
markdown subset (usually a table or a nested list). Rewrite it inside the subset
and `--push`.

**`[gone]`** — the GID in `state.json` returns 404: the task was deleted or moved
out of reach. The local row is left alone. Decide whether to delete the row or
re-create the task.

**`✖ --force is only valid together with --keys`** — intentional. Conflict
resolution is a per-ticket human decision.

**A task has no planner ID in `board.mjs`** — it was created outside the planner.
If it hangs off a mapped epic or story, adopt it with `sync.mjs --pull-new`; a
whole new epic belongs in its own dry-run folder.
