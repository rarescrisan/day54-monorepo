# Skeleton repo handoff — React + Next.js monorepo with Claude skills, Asana ticketing, husky, and CI/CD

**Audience:** a Claude Code session running inside a freshly initialized, empty git repository. A human is driving; they picked this document as the spec. Everything needed is in this file — you do not need access to any other repository.

**What you are building:** an example/skeleton monorepo that packages the engineering workflow developed in `novo-notification-service` (a NestJS backend), re-targeted at a React + Next.js frontend stack and at **Asana** (not Jira) for ticket management. The deliverables:

1. A Turborepo + pnpm monorepo scaffold with a Next.js app, strict TypeScript, ESLint + Prettier, Vitest, and Playwright.
2. A `CLAUDE.md` + `.claude/skills/` setup: 8 portable engineering-discipline skills (verbatim in Appendix A) plus 4 ticket-workflow skills rebuilt for Asana (Appendix B).
3. A ticket-planner script suite (`.claude/ticket-planner/`) ported from the Jira REST API to the Asana REST API — same architecture: dry-run JSONL → resumable replay → two-way field sync → board readout.
4. Husky hooks: conventional-commit enforcement, lint-staged pre-commit, branch-name + test gate pre-push.
5. CI/CD on the three-branch promotion model (`develop → main → release`): CI on PRs, AI-generated promotion-PR titles/descriptions with a semver judgement, label-driven version bump on `main`, conventional-commit tag releases from `develop`.
6. (Optional) Architecture docs under `docs/architecture/` with a CI job that detects spec drift on every merge and opens a correction PR.

## How to work this document

- Work **phase by phase, in order**. Each phase ends with a **Verify** block — run those checks before moving on. Track progress with your todo list.
- Full file contents live in the phases and appendices. Where a file is given verbatim, write it **exactly** — these files encode hard-won fixes; "improvements" usually reintroduce the bug the odd-looking line was guarding against.
- Placeholders you must resolve are written `«LIKE_THIS»`. Some come from the user (org name, Asana GIDs), some from commands you run during setup. Never leave one in a committed file.
- Version numbers for the JS toolchain are **not** pinned in this document (it will age). At init time, use the latest stable of each tool, then **pin exactly** — no `^` or `~` anywhere, ever, in this repo. The lockfile is committed.
- Secrets (Asana PAT, Anthropic API key, GitHub PAT) are **never** written to the repo. Env vars and GitHub Actions secrets only.
- Anything Asana-API-specific in Phase 3 that is marked *verify against current docs* must be checked against <https://developers.asana.com/reference> while building — Asana's HTML subset and plan-tier gating change over time.

### Questions to ask the user before Phase 0

1. GitHub org/repo name, and whether the repo is private (default: private).
2. Asana workspace, the project to use as the board, and whether the workspace is on a paid tier (custom fields and dependencies are paid features — Phase 3 has a degraded mode if not).
3. A short ticket-prefix for planner IDs (e.g. `WEB`), used like `WEB-CTA-3`.
4. Whether to include Phase 6 (architecture docs + drift CI). It costs an `ANTHROPIC_API_KEY` secret and a per-merge API call.

---

## Target layout

```
.
├── CLAUDE.md                        # behavioral guidelines (Phase 1)
├── .claude/
│   ├── WRITING_GUIDELINES.md        # repo-specific code rules (Phase 1)
│   ├── skills/                      # 12 skills (Phase 2; Appendices A & B)
│   └── ticket-planner/              # Asana planner scripts + dry-runs (Phase 3)
├── .husky/                          # commit-msg, pre-commit, pre-push (Phase 4)
├── .github/
│   ├── workflows/                   # ci, release-pr, version-bump, tag-release[, docs-drift] (Phase 5/6)
│   └── scripts/                     # CI-only Anthropic scripts, own package.json (Phase 5/6)
├── docs/
│   ├── architecture/                # specs (Phase 6, optional)
│   └── handoff/                     # this document lives here too
├── apps/
│   └── web/                         # Next.js app (App Router)
├── packages/
│   ├── ui/                          # shared React components
│   ├── eslint-config/               # shared ESLint config
│   └── typescript-config/           # shared tsconfig bases
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

### Branch model (assumed by Phases 4 and 5)

```
feature/* ──PR──> develop ──promotion PR──> main ──promotion PR──> release
                     │                       │
                     │                       └─ version-bump.yml bumps package.json
                     └─ tag-release.yml mints a vX.Y.Z tag + GitHub Release
```

- `develop` — the **default branch**. Feature PRs target it. Every push to it mints a semver tag from conventional-commit messages.
- `main` — the "current version" branch. `package.json` on `main` is the version of record.
- `release` — the production promotion lane. PRs into it run the full CI gate.
- Only `develop → main` and `main → release` are "promotion PRs"; the AI PR-description workflow fires only on those two lanes.
- **Merge strategy: merge commits (not squash)** on the promotion lanes and on `develop`. The tag-release job derives semver bumps from individual commit messages; squash-merging replaces them with the PR title, which bypasses the commit-msg hook and silently degrades every release to `patch`. If the user insists on squash, add a PR-title linter and note the tradeoff in the README.

---

## Phase 0 — Scaffold the monorepo

1. Initialize with the official Turborepo Next.js starter (`pnpm dlx create-turbo@latest`) or hand-build the layout above — either way the end state is:
   - `pnpm-workspace.yaml` covering `apps/*` and `packages/*`.
   - `apps/web`: Next.js (App Router, TypeScript, `src/` dir), consuming `@repo/ui`.
   - `packages/ui`: a shared component package with at least one real component used by `apps/web`.
   - `packages/eslint-config` and `packages/typescript-config`: shared configs, consumed by the app and packages.
2. TypeScript: `"strict": true` everywhere. ESLint: `@typescript-eslint/no-explicit-any: error`, `no-console: error` (allow `console.error`/`warn` in scripts), `import/no-cycle: error`. Prettier owns formatting; end the ESLint `extends` chain with `eslint-config-prettier` so the two never fight.
3. Tests:
   - **Vitest + React Testing Library** in `apps/web` and `packages/ui`. Test through the rendered component surface (see the `test-like-a-user` skill) — no snapshot-everything, no mocking your own components.
   - **Playwright** in `apps/web` for e2e (`pnpm run e2e`), configured to build + start the app itself.
4. `turbo.json` tasks: `build`, `lint`, `typecheck`, `test`, `e2e` (e2e depends on `build`; not part of the default pipeline). Root `package.json` scripts delegate to turbo: `"build": "turbo run build"`, etc., plus `"format": "prettier --write ."`.
5. Pin every dependency exactly (strip `^`/`~` after install; keep it that way). Commit `pnpm-lock.yaml`.
6. Create the three branches: commit the scaffold to `develop`, then `git branch main && git branch release`, push all three, and set `develop` as the default branch on GitHub.

**Verify:**
- [ ] `pnpm install && pnpm run build && pnpm run lint && pnpm run typecheck && pnpm run test` all pass from a clean clone.
- [ ] `pnpm run e2e` passes locally (Playwright browsers installed).
- [ ] `grep -rE '"[~^]' package.json apps/*/package.json packages/*/package.json` finds nothing.
- [ ] GitHub shows `develop` as default; `main` and `release` exist.

---

## Phase 1 — CLAUDE.md and writing guidelines

Two files. `CLAUDE.md` is the behavioral core (portable, mostly verbatim from the source repo); `.claude/WRITING_GUIDELINES.md` is repo-specific and starts small — it grows as conventions solidify, it is not invented up front.

### `CLAUDE.md`

````markdown
# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes.

Repository-specific code-writing rules (layout, naming, component conventions):
@.claude/WRITING_GUIDELINES.md

## Custom Skills

This project defines specialized skills in `.claude/skills/`:

- **`/clarify-and-plan`** — Use at the start of any non-trivial task before coding.
- **`/explore-before-coding`** — Use before writing or editing any code.
- **`/respect-the-layers`** — Use when adding code that crosses module boundaries.
- **`/complete-the-wiring`** — Use when adding new named things (config keys, env vars, packages, routes, components, dependencies).
- **`/debug-root-cause`** — Use when investigating bugs, failing tests, or unexpected behavior.
- **`/surgical-diffs`** — Use when editing existing code.
- **`/test-like-a-user`** — Use when writing or modifying tests.
- **`/verify-before-done`** — Use before committing nontrivial changes.

Ticket workflow (backed by the scripts in `.claude/ticket-planner/`):

- **`/plan-tickets`** — Turn a PRD/RFC/handoff doc into Asana tasks via a reviewable dry-run folder.
- **`/work-ticket`** — Pick up a ticket by planner ID; loads design context, checks blockers, implements against acceptance criteria.
- **`/sync-tickets`** — Reconcile local ticket files and Asana when either side drifted.
- **`/kanban-review`** — Board readout: health, action items, what's ready to release.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Ticket IDs

**Tickets are identified by planner IDs like `«PREFIX»-CTA-3` — short strings minted in `.claude/ticket-planner/dry-runs/`. Asana has no human-readable issue keys; the planner ID is the durable handle.**

- `state*.json` in each dry-run folder maps planner ID → Asana task GID + permalink. Never match tickets by task name.
- Commit scopes and PR titles carry the planner ID: `feat(«PREFIX»-CTA-3): …` — that is how `/kanban-review` cross-references PRs.
- `/work-ticket` does the resolution and loads the surrounding design context — use it rather than hand-rolling the lookup.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
````

Replace `«PREFIX»` with the ticket prefix the user chose.

### `.claude/WRITING_GUIDELINES.md` (starter)

Write a short starter covering only what the scaffold already establishes — do **not** speculate rules the repo doesn't practice yet:

- **Layout:** `apps/` for deployable Next.js apps; `packages/` for shared code consumed via workspace `@repo/*` names — never deep relative imports across package boundaries.
- **Server vs client:** default to Server Components; `"use client"` only when the component needs state, effects, or browser APIs. Anything `NEXT_PUBLIC_` ships to the browser — never a secret. Data-access modules start with `import 'server-only'`.
- **Components:** function components, named exports, one component per file, colocated `*.test.tsx`.
- **Naming:** PascalCase components/types, lowerCamelCase functions/variables, kebab-case file names, UPPER_SNAKE_CASE exported constants.
- **TypeScript:** strict; no `any`; explicit return types on exported functions.
- **Testing:** through the rendered surface (Testing Library queries by role/label, not test-ids where avoidable); Playwright for flows; no mocking your own modules — mock at the network boundary (MSW or Playwright route interception).
- **Dependencies:** exact pins; nothing new without asking; check for an existing in-repo solution first.
- Name a **canonical reference component** once one exists (pick the best `packages/ui` component) — "when in doubt, copy its shape".

**Verify:**
- [ ] Both files exist; `CLAUDE.md` references the guidelines file with the `@` include.
- [ ] No `«…»` placeholders remain.

---

## Phase 2 — Install the skills

Create `.claude/skills/<name>/SKILL.md` for all twelve skills:

- The **8 portable skills** are in **Appendix A**. Copy them **verbatim** — they are deliberately repo-agnostic and nothing in them may reference this repo or the source repo.
- The **4 ticket-workflow skills** (Asana editions) are in **Appendix B**. They contain `«…»` placeholders (ticket prefix, project name) — resolve them as you write the files.

Also write `.claude/skills/README.md`:

````markdown
# Coding Skills

Portable, repo-agnostic skills that encode senior-engineer working discipline as explicit
procedures. They target the failure modes that most separate weak coding agents from strong
ones: coding before reading, hallucinated APIs, noisy diffs, claiming success without running
anything, guess-and-check debugging, mock-heavy tests, layer violations, and half-wired additions.

## The skills, in task-lifecycle order

| Skill | When it fires | Core rule |
|---|---|---|
| [explore-before-coding](explore-before-coding/SKILL.md) | Before writing/editing any code | Find the canonical example; verify every API exists before calling it |
| [clarify-and-plan](clarify-and-plan/SKILL.md) | Start of any non-trivial task | State assumptions; define "done" as a checkable criterion per step |
| [surgical-diffs](surgical-diffs/SKILL.md) | Editing existing code | Every changed line traces to the request; self-review the diff |
| [respect-the-layers](respect-the-layers/SKILL.md) | Working in layered/modular codebases | Code lives in its designated layer; dependencies point down only |
| [complete-the-wiring](complete-the-wiring/SKILL.md) | Adding any new named thing | Grep the newest sibling's footprint; match it location for location |
| [test-like-a-user](test-like-a-user/SKILL.md) | Writing or changing tests | Test through the public surface; mock only at the system boundary |
| [debug-root-cause](debug-root-cause/SKILL.md) | Any bug, failing test, or unexpected behavior | No fix before a reproduction and a one-sentence causal explanation |
| [verify-before-done](verify-before-done/SKILL.md) | Before declaring anything complete | Done means a check you ran passed; report failures honestly |

## Ticket-workflow skills (Asana)

These drive the scripts in [.claude/ticket-planner/](../ticket-planner/) — setup, layout and
Asana quirks are documented in [asana-planner-guide.md](../ticket-planner/asana-planner-guide.md).

| Skill | When it fires |
|---|---|
| [plan-tickets](plan-tickets/SKILL.md) | Turning a PRD/RFC/handoff into tickets, via a reviewable dry-run |
| [work-ticket](work-ticket/SKILL.md) | Implementing a ticket by planner ID |
| [sync-tickets](sync-tickets/SKILL.md) | Local tickets and the board may have drifted |
| [kanban-review](kanban-review/SKILL.md) | Board status readout |

## How they compose on a typical task

1. **explore-before-coding** — read the code, find the pattern to copy.
2. **clarify-and-plan** — surface assumptions, write verifiable steps.
3. **surgical-diffs** + **respect-the-layers** + **complete-the-wiring** — make the change correctly and minimally.
4. **test-like-a-user** — pin the behavior with a real test.
5. **debug-root-cause** — when anything fails, diagnose instead of guessing.
6. **verify-before-done** — prove it, then report honestly.
````

**Verify:**
- [ ] All 13 files exist (12 skills + README); the skills appear in Claude Code's skill listing in a fresh session.
- [ ] `grep -rn '«' .claude/skills/` finds nothing.
- [ ] `grep -rln 'Jira\|novo-notification' .claude/skills/*/SKILL.md` finds nothing (the Asana skills must be fully re-targeted, not find-and-replaced).

---

## Phase 3 — Ticket planner, Asana edition

This is a **port**, not a copy: the source repo's planner talks to Jira; you are rebuilding the same architecture against the Asana REST API (<https://developers.asana.com/reference>). The architecture is the valuable part — keep it exactly:

- **Planning happens on disk first.** Every initiative becomes a reviewable dry-run folder; nothing is written to Asana until the user approves.
- **`replay.mjs` is the only write path for creation**, and it is resumable: state is saved after every single API call, so a crash costs nothing and re-running the identical command picks up where it stopped.
- **`sync.mjs` reconciles field-level drift in both directions** against a recorded baseline, so direction (push vs pull vs conflict) is *known*, never guessed. Nothing is written until the user picks a direction. There is no auto-merge.
- **Workflow state is never automated.** Scripts read board columns and completion; they never move a card, complete a task, or change an assignee. Moving a card is a human action.

### 3.1 Layout

```
.claude/ticket-planner/
├── asana.mjs                Shared: REST client, markdown ⇄ html_notes, field builders, state I/O
├── replay.mjs               Create tasks from a dry-run JSONL (resumable)
├── sync.mjs                 Two-way sync between a JSONL and Asana
├── board.mjs                Read the board (read-only)
├── asana-planner-guide.md   Setup + reference (write it as Phase 3.8)
└── dry-runs/<slug>/
    ├── tickets-MMDDYYYY.jsonl   the tickets
    ├── state-MMDDYYYY.json      local_id → Asana GID/permalink, progress, sync baseline
    ├── README.md                origin, design decisions, open questions
    ├── recommended-order.md     dependency-aware build order
    └── asana-map.md             planner ID ↔ Asana permalink table
```

`asana.mjs` is the **single home** for the markdown ⇄ html_notes converters on purpose: `sync.mjs` detects drift by projecting both sides through the same conversion, so a second copy that drifted would produce phantom diffs on untouched tickets.

### 3.2 Concept mapping — Jira → Asana

| Jira concept (source repo) | Asana equivalent (this repo) |
|---|---|
| Site + project (`NS`) | Workspace GID + project GID (board layout) |
| Issue key `NS-240` | **None.** Tasks have opaque GIDs + permalink URLs. The planner `local_id` is the durable human handle (see 3.3) |
| Epic | Top-level task in the project |
| Story | **Subtask of its epic, multi-homed into the project** (`POST /tasks/{gid}/addProject`) so it appears as a board card. Native `parent` gives the hierarchy; multi-homing gives board visibility |
| Sub-task | Subtask of its story. **Not** multi-homed — they are checklist items, not cards |
| `Blocks` link | Native dependencies (`POST /tasks/{gid}/addDependencies`) |
| Priority Highest…Lowest | **Priority** custom field, single-select enum `P1`–`P5` |
| Story points (`customfield_10050`) | **Story Points** custom field, number |
| Labels | Tags (workspace-level; create-or-reuse by name) |
| Status / board columns | Sections of the project. Read-only for all scripts |
| Assignee account ID | Assignee GID |
| Description: markdown ⇄ ADF | Description: markdown ⇄ `html_notes` (see 3.5) |
| JQL | No equivalent needed: `board.mjs` lists the project's tasks and filters client-side (the Search API is paid-tier and unnecessary here) |

> **Plan-tier note:** custom fields and dependencies require a paid Asana tier. Ask the user (Phase 0 questions). Degraded mode for free tier: encode priority and points as tags (`P1`…`P5`, `pts:1`…`pts:13`), keep `blocks`/`blocked_by` only in the JSONL plus a literal "Blocked by «local_id»" line at the top of the description, and make `sync.mjs` skip the priority/points fields.

### 3.3 Identity model

- `local_id` uses the user's prefix and an initiative tag: `«PREFIX»-CTA-E1` (epic), `«PREFIX»-CTA-1` (story), `«PREFIX»-CTA-1.2` (sub-task of story 1).
- After replay, the `local_id` **is** the ticket's permanent name — commit scopes, PR titles, and conversation all use it (`feat(«PREFIX»-CTA-3): …`).
- `state.json` maps `local_id → { gid, permalink }`. It is the **only** mapping. Never identify a task by its name — names are editable and not unique.
- Never renumber `local_id`s after a replay; the state file maps by them. Append new IDs instead.

### 3.4 The JSONL schema (unchanged from the source design)

One JSON object per line:

| Field | Epic | Story | Sub-task |
|---|:--:|:--:|:--:|
| `local_id` | ✓ | ✓ | ✓ |
| `type` (`Epic` / `Story` / `Sub-task`) | ✓ | ✓ | ✓ |
| `summary` | ✓ | ✓ | ✓ |
| `priority` (`P1`–`P5`) | ✓ | ✓ | ✓ |
| `labels` (string[]) | ✓ | ✓ | ✓ |
| `story_points` | `null` | Fibonacci 1/2/3/5/8/13 | `null` |
| `description_markdown` | ✓ | ✓ | ✓ |
| `epic_local_id` | — | ✓ | — |
| `parent_local_id` | — | — | ✓ |
| `blocks` / `blocked_by` (local ids) | — | ✓ | — |

Story descriptions follow the template `## Context` / `## Requirements` / `## Acceptance`, where every Acceptance bullet is a command + observable outcome (e.g. `` `pnpm run test -- cta` passes ``), because `work-ticket` later verifies against those bullets verbatim. Sub-task descriptions are one or two lines. Summaries take an optional layer prefix for board filtering: `[FE]`, `[API]`, `[INFRA]`, `[QA]`, `[DOCS]` — omit when the work doesn't split by layer.

`state.json` shape: `{ "issues": { "<local_id>": { "gid": "…", "permalink": "…" } }, "homed": [], "links": [], "sync": { … } }` — `homed`/`links` track replay progress per pass; `sync` is the baseline written by `--adopt`.

### 3.5 Markdown ⇄ `html_notes`

Asana task descriptions are set via `html_notes`, an XML-like subset wrapped in `<body>…</body>`. Unsupported tags are rejected with a 400 — so the converter must emit **only** the verified subset. *Verify the current allowed tag list against the Asana rich-text docs while building*; as a baseline, target: `<h1>`, `<h2>`, `<strong>`, `<em>`, `<code>`, `<a href>`, `<ol>`, `<ul>`, `<li>`, `<hr>`.

Supported local markdown subset (document this in the guide and in `plan-tickets`): headings, paragraphs, `-`/`*` bullets, `1.` ordered lists, `**bold**`, inline `` `code` ``, `[text](url)`, `---` rules. **Not supported:** tables, images, task lists, nested lists (flatten one level). Fenced code blocks: if `<pre>` is accepted by the API, map fences to it; otherwise render each fence as consecutive `<code>` lines and say so in the guide. Anything outside the subset degrades on the way in and again on every sync — keep descriptions inside it.

The pull direction (html_notes → markdown) must invert the same mapping, and `sync.mjs` compares both sides **after projection through this converter**, so cosmetic differences (paragraph re-wrapping) never report drift.

### 3.6 Script contracts

All scripts: Node ≥ 20, zero npm dependencies (use global `fetch`), executable via `node .claude/ticket-planner/<script>.mjs`. Credentials come from a single env var `ASANA_TOKEN` (a personal access token from the Asana developer console). Every script exits `2` with a clear message if it is missing. GIDs are **strings** — never parse them as numbers. Handle `429` by honoring `Retry-After` and retrying; throttle replay to stay under the workspace's rate limit (~150 req/min on free tier). Asana paginates with `next_page` offset tokens — follow them; and always pass `opt_fields` explicitly (default responses are compact records).

Fixed identifiers (workspace GID, project GID, assignee GID, Priority field GID + its five enum-option GIDs, Story Points field GID) are **hardcoded in `asana.mjs`** after a one-time discovery, exactly like the source repo hardcodes its Jira IDs. Build `asana.mjs` with a `--setup` mode that walks the user through discovery: list workspaces → list projects → read the project's `custom_field_settings` → print the constants block to paste into the file. If the Priority / Story Points fields don't exist yet, `--setup` offers to create them on the project.

**`replay.mjs`** — `--input <tickets.jsonl>` `[--state <state.json>]` (defaults to `<input-dir>/state.json`) `[--smoke]` `[--update <ids>]`. Four passes:

1. **Epics** — `POST /tasks` with `projects: [PROJECT]`, name, html_notes, assignee, tags, custom fields.
2. **Stories** — `POST /tasks` with `parent` = the epic's GID at create, then `POST /tasks/{gid}/addProject` to multi-home into the project (record each in `state.homed` so the pass is resumable).
3. **Dependencies** — for each `blocked_by`, `POST /tasks/{dependent}/addDependencies`. Dedupe both directions of `blocks`/`blocked_by` into one edge; record each in `state.links`.
4. **Sub-tasks** — `POST /tasks` with `parent` = the story's GID. Not multi-homed.

State is saved to disk after **every** call. `--smoke` creates one throwaway task in the project and prints its permalink for the user to delete. `--update «ids»` overwrites the named tickets' fields from the JSONL, cascading to their sub-tasks.

**`sync.mjs`** — modes `--status | --adopt | --pull | --push | --pull-new`, plus `--keys <ids>` and `--force`. The model, verbatim from the source design:

`state.json` carries a `sync` baseline: a hash of every synced field as it stood on **both** sides at the last sync. Per field: `in-sync` (both agree) · `push →` (only local moved; fixed by `--push`) · `pull ←` (only Asana moved; `--pull`) · `conflict !!` (both moved; user picks, then `--force --keys …`) · `diverged ??` (no baseline; same resolution). A push writes **only** the fields it is pushing, so one task can push some fields and pull others safely. `--force` is only valid together with `--keys`, never board-wide.

Synced fields: `summary` ↔ name, `description_markdown` ↔ html_notes, `labels` ↔ tags, `priority` ↔ Priority field, `story_points` ↔ Story Points field (Stories only; other types read as `null`). **Never synced in either direction:** section/column, `completed`, assignee, parent, dependencies. `--pull-new` finds subtasks of mapped epics/stories with no local row, mints the next `local_id` in the series, and appends them to the JSONL (dependencies come back empty — fill them in by hand, then `--adopt`). A mapped GID that 404s is reported as `[gone]`; the local row is left alone.

**`board.mjs`** — `[--stale <days>]` (default 7) `[--section <name>]` `[--tag <name>]`. Lists the project's incomplete tasks grouped by section, using `opt_fields=name,completed,memberships.section.name,custom_fields,modified_at,permalink_url,parent,tags.name,num_subtasks`. Per task: planner ID (reverse-looked-up from the dry-run state files), points, days since `modified_at`, priority, name. Footer: per-section counts, stale tasks, stories missing estimates. Read-only.

### 3.7 Asana gotchas (document these in the guide)

| Quirk | Handling |
|---|---|
| Subtasks are invisible on the board unless multi-homed | Replay pass 2 multi-homes stories; sub-tasks stay off-board by design |
| `html_notes` 400s on any tag outside the allowed subset | Converter emits only the verified subset; never pass user HTML through |
| Custom fields / dependencies are paid-tier | Degraded mode in 3.2; `--setup` detects and warns |
| Task names are not unique and freely editable | Identity is `state.json` only; never match by name |
| GIDs are strings | Never `parseInt`; compare with `===` |
| Rate limit 429 + `Retry-After` | Client-level retry with backoff; replay throttles proactively |
| Pagination via `next_page` offset tokens | Client helper follows them; a missing page is silent truncation, the worst failure mode |
| No status field — a column is a section membership, "done" is `completed` | `board.mjs` reads both; nothing ever writes them |
| Tags are workspace-global | Create-or-reuse by exact name; cache the name→GID map per run |

### 3.8 Write `asana-planner-guide.md`

Mirror the source repo's guide structure: **Setup** (PAT creation, `ASANA_TOKEN`, `--setup` discovery, `--smoke` proof), **Fixed identifiers** (the filled-in table), **Layout**, **Commands**, **Conventions** (local IDs are not task names; markdown subset; priority mapping; never-automated list), **Known Asana quirks** (3.7), **Troubleshooting** (missing token, 401, replay stopped partway → re-run same command, everything `diverged` → no baseline yet → resolve then `--adopt`, drift on an untouched ticket → description outside the markdown subset).

**Verify (against the user's real Asana project — get their go-ahead first):**
- [ ] `node .claude/ticket-planner/replay.mjs --smoke` creates one task; user deletes it in the UI.
- [ ] A test dry-run folder (1 epic, 2 stories with one `blocked_by` edge, 1 sub-task) replays cleanly; board shows epic + story cards in the first section; the story shows its dependency; the sub-task hangs off its story.
- [ ] Kill replay mid-run (Ctrl-C after pass 1), re-run the identical command — it resumes without duplicating the epic.
- [ ] `sync.mjs --adopt` then `--status` reports zero drift. Rename a task in the Asana UI; `--status` shows `pull ←` on `summary` only; `--pull` fixes it; `--status` is clean again.
- [ ] `board.mjs` prints the section-grouped readout with planner IDs resolved.
- [ ] Delete the test tasks and the test dry-run folder afterward.

---

## Phase 4 — Husky hooks

### Install

```bash
pnpm add -D --save-exact husky lint-staged
pnpm exec husky init
```

Root `package.json` additions:

```json
{
  "scripts": {
    "prepare": "husky"
  },
  "lint-staged": {
    "{apps,packages}/**/*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "{apps,packages}/**/*.{js,mjs,json,css}": ["prettier --write"],
    "*.{js,mjs,json,md,yaml,yml}": ["prettier --write"]
  }
}
```

`prepare` runs on `pnpm install`, so hooks self-install for every contributor. After writing the three hooks below: `chmod +x .husky/*`.

### `.husky/commit-msg`

Enforces Conventional Commits plus a 15-character minimum. This is what lets `tag-release.yml` (Phase 5) derive semver bumps from commit messages. Verbatim:

```sh
#!/usr/bin/env sh

commit_message_file=$1
commit_message=$(cat "$commit_message_file")

# Minimum length for commit messages
min_length=15

# Allow merge commits and commits that reference older commits (i.e., squash, rebase)
case "$commit_message" in
  "Merge "*)
    echo "Merge commit detected. Skipping commit message validation."
    exit 0
    ;;
esac

if [ -f .git/CHERRY_PICK_HEAD ]; then
  echo "Cherry-pick detected. Skipping commit message validation."
  exit 0
fi

if [ -f .git/rebase-merge/interactive ]; then
  echo "Rebase in progress. Skipping commit message validation."
  exit 0
fi

# Conventional Commits. The optional "!" before ":" is the breaking-change
# marker (e.g. "feat!: drop v1 endpoint") — tag-release.yml maps it to a
# major bump.
valid_commit_regex='^(feat|fix|chore|docs|style|refactor|test|build|ci|perf|revert|BREAKING CHANGE)(\(.+\))?!?: .{1,100}$'

if ! echo "$commit_message" | grep -Eq "$valid_commit_regex"; then
  echo "❌ Uh-oh! Your commit message doesn't follow the required format. 😓"
  echo "✨ Please follow the Conventional Commits format:"
  echo "  🛠️ feat(scope): add a new feature"
  echo "  🐛 fix(scope): fix a bug"
  echo "  🔧 chore(scope): some maintenance work"
  echo "📝 Examples of valid commit messages:"
  echo "  - feat(auth): add login functionality"
  echo "  - fix(api): handle errors correctly in user endpoint"
  echo "  - style(button): update primary button color"
  echo "  - ci(github-actions): add cache for Node modules"
  echo "🛑 Commit blocked. Please update your message and try again!"
  exit 1
fi

if [ ${#commit_message} -lt $min_length ]; then
  echo "⚠️ Your commit message is too short! It must be at least $min_length characters long."
  echo "💡 Please provide more context in your message."
  echo "🛑 Commit blocked. Add more details and try again."
  exit 1
fi

echo "✅ Commit message looks good."
```

Behavior notes (document them in the repo README): the regex is matched line-by-line, so a `BREAKING CHANGE: …` body line passes even under a conventional subject — that is intended; the length check counts the whole message; merge/cherry-pick/rebase commits are skipped by design.

**Breaking-change convention for this repo:** both `type!:` subjects and `BREAKING CHANGE:` body lines are accepted by the hook and mapped to a major bump by `tag-release.yml`. Document **`type!:` in the subject** as the preferred form and state it in the README — it survives more git plumbing than a body line.

### `.husky/pre-commit`

```sh
#!/usr/bin/env sh

echo "🔍 Setting up environment for Git hooks..."

# Load nvm if available (for user-specific installations)
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  echo "🔧 Loading nvm..."
  . "$NVM_DIR/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js not found! Please install it or ensure it's available in PATH."
  exit 1
fi

echo "🔍 Checking code formatting and linting... 🛠️"

pnpm exec lint-staged

if [ $? -ne 0 ]; then
  echo "❌ Linting or formatting issues found. Please fix them before committing. 🛑"
  echo "💡 Try running 'pnpm exec lint-staged' or 'pnpm run format'."
  exit 1
fi

echo "✅ All linting and formatting checks passed."
```

The nvm block matters: GUI git clients (IDEs, GitHub Desktop) don't source your shell profile, so `node` is often missing from `PATH` without it.

### `.husky/pre-push`

Enforces the branch naming the promotion lanes depend on, and gates the push on the fast checks. (The source repo runs its full DB-backed integration suite here; this repo's equivalent gate is lint + typecheck + unit/component tests — Playwright e2e stays in CI, it's too slow for a push hook.)

```sh
#!/usr/bin/env sh

branch=$(git symbolic-ref --short HEAD)
if ! echo "$branch" | grep -Eq '^(main|release|develop)$|^(feature|feat|chore|fix|bugfix|hotfix|refactor|docs)/.+'; then
  echo "Branch '$branch' is not allowed."
  echo "  Long-lived: main, release, develop"
  echo "  Feature:    feature/<name>, feat/<name>"
  echo "  Other:      chore/<name>, fix/<name>, bugfix/<name>, hotfix/<name>, refactor/<name>, docs/<name>"
  exit 1
fi

pnpm turbo run lint typecheck test || exit 1
```

**Verify:**
- [ ] A commit with message `bad message` is rejected; `chore(repo): add husky hooks` passes.
- [ ] Staging a file with a lint error blocks the commit; fixing it unblocks.
- [ ] Pushing from a branch named `wip` is rejected; from `chore/hooks-test` it runs the checks and passes.
- [ ] A fresh `pnpm install` in a clean clone installs the hooks (`.git/hooks/husky` wiring present).

---

## Phase 5 — CI/CD

Five pieces: CI on PRs, AI-generated promotion PRs, the shared CI-scripts package, version bump on `main`, tag releases from `develop`.

### Repo settings and secrets (do this first — tell the user what to click)

| Item | Why |
|---|---|
| Secret `ANTHROPIC_API_KEY` | `release-pr.yml` (and Phase 6). Without it the workflow fails and `version-bump.yml` falls back to `patch` — silent under-bumping. |
| Secret `RELEASE_PUSH_TOKEN` | Fine-grained PAT (or GitHub App token), `Contents: read/write`, owned by an actor on `main`'s branch-protection bypass list. `version-bump.yml` pushes to protected `main` with it. |
| Branch protection on `main` and `release` | Require the CI checks; require PRs. `develop` protection per the user's taste. |
| Merge strategy | Allow **merge commits**; disable squash on `develop`/promotion lanes (see the branch-model note — squash silently degrades every release to `patch`). |

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [develop, main, release]

concurrency:
  group: ci-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  checks:
    name: Lint, typecheck, test, build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4   # version comes from "packageManager" in package.json
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run lint typecheck test build

  e2e:
    name: Playwright e2e
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
        working-directory: apps/web
      - run: pnpm turbo run e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: apps/web/playwright-report
          retention-days: 7
```

Set `node-version` to the current LTS at init and add `"packageManager": "pnpm@<exact version>"` to the root `package.json` — `pnpm/action-setup` reads it, so CI and local pnpm can't drift.

### `.github/scripts/` — the CI-only Anthropic scripts package

This directory is deliberately **not** part of the app build: its own `package.json`, installed with `npm ci --prefix .github/scripts` (plain npm on purpose — no workspace entanglement), never in `pnpm-workspace.yaml`.

`.github/scripts/package.json`:

```json
{
  "name": "ci-scripts",
  "description": "CI-only scripts calling the Anthropic API for release-PR generation (and optionally docs drift). Not part of the app build.",
  "private": true,
  "type": "module",
  "dependencies": {
    "@anthropic-ai/sdk": "«latest, pinned exactly — no ^»"
  }
}
```

Run `npm install --prefix .github/scripts` once and **commit `.github/scripts/package-lock.json`** — the workflows use `npm ci`, which fails without it. Add `.github/scripts/node_modules/` to `.gitignore`.

`.github/scripts/release-pr.mjs`:

```javascript
// Generates a release-PR title + description (and, for develop -> main, a
// semver bump judgement) from the set of PRs being promoted.
//
// Inputs (env):
//   ANTHROPIC_API_KEY  - required by the SDK client
//   BASE_BRANCH        - PR base branch (main | release)
//   HEAD_BRANCH        - PR head branch (develop | main)
//   INCLUDE_BUMP       - "true" to also judge the semver bump (develop -> main)
//   CURRENT_VERSION    - package.json version currently on the base branch
//   PR_DATA_FILE       - path to JSON array: [{number, title, body, author}]
//   COMMITS_FILE       - path to plain-text list of non-merge commit subjects
//
// Output: a single JSON object on stdout:
//   { title, description }                        when INCLUDE_BUMP != "true"
//   { title, description, bump, bump_reason }     when INCLUDE_BUMP == "true"

import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const baseBranch = process.env.BASE_BRANCH;
const headBranch = process.env.HEAD_BRANCH;
const includeBump = process.env.INCLUDE_BUMP === 'true';
const currentVersion = process.env.CURRENT_VERSION ?? 'unknown';

const prs = JSON.parse(fs.readFileSync(process.env.PR_DATA_FILE, 'utf8'));
const commits = fs.readFileSync(process.env.COMMITS_FILE, 'utf8').trim();

const truncate = (s, n) =>
  s && s.length > n ? `${s.slice(0, n)}\n…[truncated]` : (s ?? '');

const prSections =
  prs.length > 0
    ? prs
        .map(
          (p) =>
            `### PR #${p.number}: ${p.title}\nAuthor: ${p.author}\n\n${
              truncate(p.body, 3000) || '(no description)'
            }`,
        )
        .join('\n\n---\n\n')
    : '(no PR metadata available — judge from the commit subjects below)';

const baseProperties = {
  title: {
    type: 'string',
    description:
      'Pull request title, <= 72 characters, format: "Release: <summary of what this promotion ships>"',
  },
  description: {
    type: 'string',
    description: 'Pull request description in GitHub-flavored markdown',
  },
};

const schema = includeBump
  ? {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'description', 'bump', 'bump_reason'],
      properties: {
        ...baseProperties,
        bump: { type: 'string', enum: ['major', 'minor', 'patch'] },
        bump_reason: {
          type: 'string',
          description: 'One or two sentences justifying the chosen bump',
        },
      },
    }
  : {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'description'],
      properties: baseProperties,
    };

const system = `You write promotion pull requests for «REPO_NAME», a React +
Next.js web application monorepo. A promotion PR merges everything on one
long-lived branch into the next one (develop -> main, or main -> release).
Your job is to read the feature PRs that were merged into the head branch
since the last promotion and summarize them for reviewers.

Rules for the description:
- Start with a "## Summary" section: a few bullets grouping the changes by
  theme (features, fixes, infra), written for a reviewer deciding whether to
  promote. Plain language, no hype.
- Then an "## Included PRs" section listing each PR as "- #<number> — <title>".
- Do not invent changes that are not evidenced by the PRs/commits provided.
- Do not include a sign-off, footer, or "generated by" note; the workflow
  appends its own.`;

const bumpInstructions = `
Also judge the semantic-version bump this promotion represents, relative to
version ${currentVersion} currently on ${baseBranch}:
- "major": any breaking change to an API contract, URL structure, or behavior
  that existing consumers depend on (including BREAKING CHANGE notes or "!"
  conventional-commit markers).
- "minor": at least one backwards-compatible new feature or capability.
- "patch": only fixes, refactors, chores, docs, tests, or CI changes.
Judge from the actual content of the PRs, not just the commit-type prefixes.
Add a "## Version" section to the description stating the chosen bump and the
one-line reason.`;

const prompt = `Promotion PR: ${headBranch} -> ${baseBranch}

Merged PRs being promoted:

${prSections}

Non-merge commit subjects in the range (fallback/context):

${commits || '(none)'}
${includeBump ? bumpInstructions : ''}`;

const client = new Anthropic();

try {
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: prompt }],
  });

  if (response.stop_reason === 'refusal') {
    console.error('Anthropic API refused the request', response.stop_details);
    process.exit(1);
  }
  if (response.stop_reason === 'max_tokens') {
    console.error('Response truncated at max_tokens; output may be invalid JSON');
    process.exit(1);
  }

  const text = response.content.find((b) => b.type === 'text')?.text;
  if (!text) {
    console.error('No text block in response');
    process.exit(1);
  }

  // Re-serialize so downstream jq always gets canonical single-object JSON.
  process.stdout.write(JSON.stringify(JSON.parse(text)));
} catch (error) {
  if (error instanceof Anthropic.RateLimitError) {
    console.error('Anthropic API rate limited:', error.message);
  } else if (error instanceof Anthropic.APIError) {
    console.error(`Anthropic API error ${error.status}:`, error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
}
```

Replace `«REPO_NAME»` in the system prompt. Model note: `claude-opus-5` is correct as of mid-2026; check the current models list when building and keep `max_tokens: 16000` (a PR description never needs more, and higher risks SDK HTTP timeouts on non-streaming calls).

### `.github/workflows/release-pr.yml`

```yaml
name: Release PR

# When a promotion PR is opened (develop -> main, or main -> release), read
# the feature PRs merged into the head branch since the last promotion and
# have Claude write the PR title + description. For develop -> main it also
# judges the semver bump (major/minor/patch) and records it as a
# "semver:<bump>" label — a human can re-label before merging to override.
# The label is consumed by version-bump.yml when the PR merges.
#
# Requires the ANTHROPIC_API_KEY repository secret.
on:
  pull_request:
    types: [opened, reopened, synchronize]
    branches: [main, release]

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: release-pr-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  describe:
    name: Generate title, description, and semver judgement
    # Only the two promotion lanes — ordinary feature PRs are untouched.
    if: >
      (github.base_ref == 'main' && github.head_ref == 'develop') ||
      (github.base_ref == 'release' && github.head_ref == 'main')
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: ${{ github.token }}
      PR_NUMBER: ${{ github.event.pull_request.number }}
    steps:
      - uses: actions/checkout@v4
        with:
          # Full history: the PR range is computed with git log base..head.
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Collect merged PRs and commits in the promotion range
        run: |
          set -euo pipefail
          base="origin/${{ github.base_ref }}"
          head="${{ github.event.pull_request.head.sha }}"

          # PR numbers from merge commits ("Merge pull request #N ...") and
          # squash-merge subjects ("... (#N)").
          # "|| true": an empty range (nothing new to promote) must not fail
          # the step under pipefail — Claude then works from an empty list.
          nums=$(git log --format='%s' "$base..$head" \
            | { grep -oE 'Merge pull request #[0-9]+|\(#[0-9]+\)$' || true; } \
            | { grep -oE '[0-9]+' || true; } | sort -un)

          echo '[]' > prs.json
          for n in $nums; do
            # Skip numbers that aren't PRs (e.g. issue references in subjects).
            if pr=$(gh pr view "$n" --json number,title,body,author \
                      --jq '{number, title, body, author: .author.login}' 2>/dev/null); then
              jq --argjson pr "$pr" '. + [$pr]' prs.json > prs.tmp && mv prs.tmp prs.json
            fi
          done

          git log --no-merges --format='%s' "$base..$head" > commits.txt
          echo "Found $(jq length prs.json) PRs, $(wc -l < commits.txt) commits in range"

      - name: Install script dependencies
        run: npm ci --prefix .github/scripts

      - name: Generate title and description with Claude
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          BASE_BRANCH: ${{ github.base_ref }}
          HEAD_BRANCH: ${{ github.head_ref }}
          INCLUDE_BUMP: ${{ github.base_ref == 'main' && 'true' || 'false' }}
          PR_DATA_FILE: prs.json
          COMMITS_FILE: commits.txt
        run: |
          set -euo pipefail
          CURRENT_VERSION=$(git show "origin/${{ github.base_ref }}:package.json" | jq -r .version)
          export CURRENT_VERSION
          node .github/scripts/release-pr.mjs > result.json

      - name: Apply title and description to the PR
        run: |
          set -euo pipefail
          title=$(jq -r .title result.json)
          jq -r .description result.json > body.md
          extra=''
          if [ "${{ github.base_ref }}" = 'main' ]; then extra=', and semver judgement'; fi
          printf '\n---\n_Title, description%s generated by Claude from the merged PRs (release-pr.yml). Re-runs on every push to this PR._\n' "$extra" >> body.md
          gh pr edit "$PR_NUMBER" --title "$title" --body-file body.md

      - name: Apply semver label (develop -> main only)
        if: github.base_ref == 'main'
        run: |
          set -euo pipefail
          bump=$(jq -r .bump result.json)
          reason=$(jq -r .bump_reason result.json)
          echo "Judged bump: $bump — $reason"

          gh label create 'semver:major' --color B60205 --description 'Version bump on merge to main' --force
          gh label create 'semver:minor' --color 0E8A16 --description 'Version bump on merge to main' --force
          gh label create 'semver:patch' --color C5DEF5 --description 'Version bump on merge to main' --force

          for l in major minor patch; do
            gh pr edit "$PR_NUMBER" --remove-label "semver:$l" 2>/dev/null || true
          done
          gh pr edit "$PR_NUMBER" --add-label "semver:$bump"
```

### `.github/workflows/version-bump.yml`

```yaml
name: Version bump on main

# When a develop -> main promotion PR merges, bump package.json on main
# according to the "semver:<bump>" label that release-pr.yml applied (and a
# human may have overridden). main's package.json is therefore the current
# released version of the app.
#
# Falls back to "patch" if no semver label is present (e.g. release-pr.yml
# never ran because the ANTHROPIC_API_KEY secret was missing).
on:
  pull_request:
    types: [closed]
    branches: [main]

permissions:
  contents: write

concurrency:
  group: version-bump-main
  cancel-in-progress: false

jobs:
  bump:
    name: Bump package.json version
    if: github.event.pull_request.merged == true && github.head_ref == 'develop'
    runs-on: ubuntu-latest
    env:
      LABELS: ${{ join(github.event.pull_request.labels.*.name, ' ') }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main
          # main is protected: push with RELEASE_PUSH_TOKEN (a fine-grained
          # PAT with Contents: read/write, owned by an actor in the branch
          # protection bypass list). Falls back to the default GITHUB_TOKEN
          # if the secret is unset — the push then fails against protection,
          # which is the honest failure mode.
          token: ${{ secrets.RELEASE_PUSH_TOKEN || github.token }}

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Bump version and push to main
        run: |
          set -euo pipefail

          bump=patch
          case " $LABELS " in
            *' semver:major '*) bump=major ;;
            *' semver:minor '*) bump=minor ;;
            *' semver:patch '*) bump=patch ;;
            *) echo "No semver label on PR #${{ github.event.pull_request.number }}; defaulting to patch" ;;
          esac

          pnpm version "$bump" --no-git-tag-version
          new=$(jq -r .version package.json)
          echo "Bump: $bump -> v$new"

          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add package.json
          git commit -m "chore(release): v$new"
          git push origin main
```

(Unlike npm, pnpm's lockfile doesn't record the root version, so only `package.json` is staged.)

### `.github/workflows/tag-release.yml`

```yaml
name: Tag release on develop

# Tags every push to develop with a semver version derived from the
# conventional commit messages (enforced by .husky/commit-msg) landed since
# the previous v* tag, and publishes a GitHub Release with generated notes.
#
# Bump rules, applied to non-merge commits in the range:
#   - any "BREAKING CHANGE"/"BREAKING-CHANGE" line, or a "type!:" subject → major
#   - else any feat commit                                               → minor
#   - else (fix, chore, docs, style, refactor, test, build, ci, perf, …) → patch
#
# Tags are the source of truth for what develop has shipped; package.json on
# main (version-bump.yml) is the released-version truth. They are independent
# by design — see the README's versioning section.
#
# Known limitation: a squash-merge bypasses the commit-msg hook (GitHub uses
# the PR title), so a non-conventional squash title classifies as patch.
# This repo uses merge commits on develop for exactly that reason.
on:
  push:
    branches: [develop]

permissions:
  contents: write

# Serialise version computation so two quick merges can't race the same tag.
concurrency:
  group: tag-release-develop
  cancel-in-progress: false

jobs:
  version:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # Full history + tags: the bump is computed from commits since the
          # last v* tag, which a shallow clone can't see.
          fetch-depth: 0

      - name: Compute semver bump and publish the release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail

          # Strict X.Y.Z tags only: default git version-sort ranks
          # v2.0.0-rc.1 ABOVE v2.0.0, so a stray prerelease tag must never
          # be picked as the base.
          last_tag=$(git tag --list 'v*' --sort=-v:refname | grep -E -m1 '^v[0-9]+\.[0-9]+\.[0-9]+$' || true)
          if [ -n "$last_tag" ]; then
            base=${last_tag#v}
            range="$last_tag..HEAD"
            echo "Last release tag: $last_tag"
          else
            base=$(node -p "require('./package.json').version")
            range=""
            echo "No previous release tag; seeding base version $base from package.json"
          fi

          if ! echo "$base" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
            echo "Base version '$base' is not plain X.Y.Z; refusing to compute a bump." >&2
            exit 1
          fi

          subjects=$(git log $range --no-merges --format='%s')
          full_messages=$(git log $range --no-merges --format='%B')

          if [ -z "$subjects" ]; then
            echo "No non-merge commits in range '${range:-<full history>}'; nothing to version."
            exit 0
          fi

          bump=patch
          if echo "$full_messages" | grep -Eq '^BREAKING[- ]CHANGE' || echo "$subjects" | grep -Eq '^[a-z]+(\([^)]*\))?!:'; then
            bump=major
          elif echo "$subjects" | grep -Eq '^feat(\([^)]*\))?:'; then
            bump=minor
          fi

          IFS=. read -r major minor patch <<< "$base"
          case "$bump" in
            major) major=$((major + 1)); minor=0; patch=0 ;;
            minor) minor=$((minor + 1)); patch=0 ;;
            patch) patch=$((patch + 1)) ;;
          esac
          version="v${major}.${minor}.${patch}"

          echo "Bump: $bump → $version"
          # Single atomic call: GitHub creates the tag and the release
          # together, so a transient failure can never leave an orphan tag
          # without a release.
          gh release create "$version" --target "$GITHUB_SHA" --title "$version" --generate-notes
```

When the repo later gains a real deploy (e.g. Vercel), move this job to run **after** the deploy succeeds in the same workflow, so a failed deploy never mints a version — that is how the source repo runs it.

### Known gotchas (put these in the repo README's CI section)

1. **A human's semver-label override gets clobbered by the next push** — `release-pr.yml` runs on `synchronize` and re-labels unconditionally. If overrides need to stick, gate the label step on `github.event.action != 'synchronize'`.
2. **Manual edits to the promotion PR title/body are overwritten on every push** by the same mechanism; the generated footer says so.
3. **Two version mechanisms exist on purpose** — tags from `develop` (what has shipped to integration), `package.json` on `main` (what was released). Nothing reconciles them; the README must name which is authoritative for what.
4. **`fetch-depth: 0` is load-bearing** in `release-pr.yml` and `tag-release.yml` — a shallow clone produces a *wrong answer*, not an error.
5. **`release-pr.yml` uses `pull_request`, not `pull_request_target`** — intentional; promotion heads are always same-repo branches, and fork PRs must not see secrets.
6. **`version-bump.yml` silently falls back to `patch`** when no label is present (e.g. missing API key). Watch the first few releases.
7. **No prerelease support** in tag-release; the strict `X.Y.Z` filter exists because git version-sort ranks `v2.0.0-rc.1` above `v2.0.0`.

**Verify:**
- [ ] Open a trivial feature PR into `develop` — the CI `checks` and `e2e` jobs run and pass.
- [ ] Merge it, and confirm `tag-release.yml` mints `v0.1.1` (or bumps per the commit types) with a GitHub Release.
- [ ] Open a `develop → main` promotion PR — `release-pr.yml` writes a title, description, and one `semver:*` label.
- [ ] Merge it — `version-bump.yml` lands `chore(release): vX.Y.Z` on `main` matching the label.
- [ ] Open a `main → release` PR — CI runs, `release-pr.yml` writes title/body, **no** semver label.

---

## Phase 6 (optional) — Architecture docs + drift automation

Skip this phase entirely if the user opted out in Phase 0. It has three parts: the specs, a skill that points at them, and a CI job that keeps them honest.

### 6.1 The specs — `docs/architecture/`

Three hand-written documents, seeded **small and true** (a page or two each describing only what the scaffold actually is — they grow with the repo; never pad them):

- `ARCHITECTURE_SPEC.md` — monorepo structure, apps and packages and their boundaries, build/test toolchain, deployment story, versioning model (the two mechanisms from Phase 5).
- `API_SPEC.md` — the app's server surface: route handlers, Server Actions, external integrations, auth model. For the fresh scaffold this honestly says "none yet" plus the conventions new surface must follow.
- `FEATURE_SPEC.md` — user-visible behavior and explicit non-goals. Include a `## Change Log (Recent Features)` section (the drift job appends there).

### 6.2 The skill — `.claude/skills/consult-architecture-docs/SKILL.md`

````markdown
---
name: consult-architecture-docs
description: Use whenever you need to quickly understand how this app works — its structure, routes, server surface, features, or module responsibilities — before diving into code. Reading the specs in docs/architecture/ first is faster and more reliable than reconstructing the big picture by grepping source files.
---

# Consult the architecture docs

Before reconstructing how this repo works from source, read the spec that already answers it:

| Question | Read |
|---|---|
| How is the monorepo structured? What owns what? | `docs/architecture/ARCHITECTURE_SPEC.md` |
| What routes / Server Actions / integrations exist? | `docs/architecture/API_SPEC.md` |
| What does the app do, and what is out of scope? | `docs/architecture/FEATURE_SPEC.md` |

The specs are kept in sync with the code by CI (`architecture-docs-drift.yml`) — trust them
as a map, then verify the specific file you're about to change. If you find a statement the
code contradicts, say so: either the drift job missed it or the change is mid-flight.
````

### 6.3 `.github/scripts/docs-drift.mjs`

```javascript
// Detects drift between the architecture specs in docs/architecture/ and the
// code that just landed on develop, and edits the specs to match.
//
// The model returns targeted find/replace edits rather than rewritten files:
// the PR diff then shows only what actually changed, and an edit whose anchor
// no longer matches is reported instead of silently mangling a spec.
//
// Inputs (env):
//   ANTHROPIC_API_KEY - required by the SDK client
//   RANGE             - the git range being analysed, e.g. "abc123..def456"
//   DIFF_FILE         - unified diff for that range
//   DIFFSTAT_FILE     - `git diff --stat` for the same range
//   COMMITS_FILE      - commit subjects + bodies in the range
//   RESULT_FILE       - where to write the JSON result (default: drift-result.json)
//
// Side effect: applies accepted edits to the spec files in the working tree.
//
// Output: RESULT_FILE, a single JSON object:
//   { drift, summary, applied: [{file, reason}], failed: [{file, reason, why}] }

import fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const SPEC_FILES = [
  'docs/architecture/ARCHITECTURE_SPEC.md',
  'docs/architecture/API_SPEC.md',
  'docs/architecture/FEATURE_SPEC.md',
];

// Cost/latency cap, not a fitting cap — an oversized diff is truncated and
// flagged in the prompt rather than failing the run.
const MAX_DIFF_CHARS = 400_000;

const range = process.env.RANGE ?? '(unknown range)';
const resultFile = process.env.RESULT_FILE ?? 'drift-result.json';

const read = (envVar) => {
  const path = process.env[envVar];
  return path && fs.existsSync(path) ? fs.readFileSync(path, 'utf8').trim() : '';
};

const rawDiff = read('DIFF_FILE');
const diff =
  rawDiff.length > MAX_DIFF_CHARS
    ? `${rawDiff.slice(0, MAX_DIFF_CHARS)}\n…[diff truncated at ${MAX_DIFF_CHARS} characters — judge the remainder from the diffstat and commit messages]`
    : rawDiff;
const diffstat = read('DIFFSTAT_FILE');
const commits = read('COMMITS_FILE');

if (!diff && !diffstat) {
  console.error('No diff to analyse — nothing to do.');
  fs.writeFileSync(resultFile, JSON.stringify({ drift: false, summary: '', applied: [], failed: [] }));
  process.exit(0);
}

const specs = SPEC_FILES.map((file) => ({ file, content: fs.readFileSync(file, 'utf8') }));

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['drift', 'summary', 'edits'],
  properties: {
    drift: {
      type: 'boolean',
      description: 'True only if at least one spec statement is now wrong, incomplete, or missing',
    },
    summary: {
      type: 'string',
      description:
        'GitHub-flavored markdown. When drift is true: a few bullets naming what changed in the code and which spec statement each edit corrects. When false: one sentence saying why the specs still hold.',
    },
    edits: {
      type: 'array',
      description: 'Empty when drift is false',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'old_string', 'new_string', 'reason'],
        properties: {
          file: { type: 'string', enum: SPEC_FILES },
          old_string: {
            type: 'string',
            description:
              'Text to replace, copied verbatim from the current file including indentation. Must appear EXACTLY ONCE in that file — include surrounding lines until it is unique.',
          },
          new_string: { type: 'string', description: 'Replacement text' },
          reason: {
            type: 'string',
            description: 'One sentence: which code change makes this edit necessary',
          },
        },
      },
    },
  },
};

const system = `You maintain the architecture documentation for «REPO_NAME», a React +
Next.js web application monorepo. Code has just landed on the develop branch.
Your job is to decide whether that code makes anything in the specs wrong, and
to correct it.

The three specs and their scopes:
- docs/architecture/ARCHITECTURE_SPEC.md — monorepo structure, apps and
  packages, build and test toolchain, deployment, versioning model.
- docs/architecture/API_SPEC.md — the app's server surface: route handlers,
  Server Actions, external integrations, auth model, error handling.
- docs/architecture/FEATURE_SPEC.md — user-visible features and behavior,
  what is explicitly out of scope, limits, integration points.

How to judge drift. A spec has drifted when the code contradicts it or has
outgrown it:
- a documented route, Server Action, page, component contract, config key,
  or env var changed or disappeared
- a new one exists that the spec's own structure clearly means to cover
- documented behavior, a limit, or a default no longer matches the code
- a stated constraint ("X is not supported", "Y is out of scope") is now false

It has NOT drifted for: refactors that preserve behavior, renamed internals the
spec never mentions, test-only changes, formatting, dependency bumps, or
anything the spec deliberately keeps at a higher level of abstraction. Prefer
returning drift: false over inventing work. A spec that is still true is the
normal outcome, not a failure.

Rules for edits:
- Only state what the diff proves. Never infer a route, prop, or behavior
  you cannot see in the code provided. If the diff is truncated and you are
  unsure, leave that part alone and say so in the summary.
- Keep edits minimal and surgical — change the sentence, table row, or code
  block that is wrong, not the section around it.
- Match the surrounding voice, formatting, heading depth, and table style
  exactly. These are hand-written documents; your edits should be invisible as
  edits.
- old_string must be copied verbatim from the file you were given, including
  leading whitespace, and must appear exactly once in that file. If a short
  anchor would be ambiguous, extend it with neighbouring lines until unique.
- Do not renumber sections, reflow prose, fix unrelated typos, or update a
  "last updated" date.
- FEATURE_SPEC.md has a "## Change Log (Recent Features)" section: add an entry
  there when a change is genuinely user-visible, matching the existing format.
  Do not add change-log entries anywhere else.`;

const specSections = specs
  .map(({ file, content }) => `### ${file}\n\n\`\`\`markdown\n${content}\n\`\`\``)
  .join('\n\n');

const prompt = `Commit range on develop: ${range}

## Commits in the range

${commits || '(none)'}

## Files changed

${diffstat || '(no diffstat available)'}

## Diff

\`\`\`diff
${diff || '(no diff available — judge from the diffstat and commit messages)'}
\`\`\`

## Current architecture specs

${specSections}`;

// --- Apply -----------------------------------------------------------

function applyEdits(edits) {
  const applied = [];
  const failed = [];
  const buffers = new Map(specs.map(({ file, content }) => [file, content]));

  for (const edit of edits) {
    const content = buffers.get(edit.file);
    if (content === undefined) {
      failed.push({ ...edit, why: `not a spec file` });
      continue;
    }
    // Count occurrences against the running buffer, so an earlier edit that
    // changed this text is visible to the check rather than silently ignored.
    const parts = content.split(edit.old_string);
    if (parts.length === 1) {
      failed.push({ ...edit, why: 'anchor text not found in the file' });
      continue;
    }
    if (parts.length > 2) {
      failed.push({ ...edit, why: `anchor text appears ${parts.length - 1} times; must be unique` });
      continue;
    }
    buffers.set(edit.file, parts.join(edit.new_string));
    applied.push(edit);
  }

  for (const { file, content } of specs) {
    const next = buffers.get(file);
    if (next !== content) fs.writeFileSync(file, next);
  }
  return { applied, failed };
}

function finish({ drift, summary, applied = [], failed = [] }) {
  fs.writeFileSync(
    resultFile,
    `${JSON.stringify(
      {
        drift,
        summary,
        applied: applied.map(({ file, reason }) => ({ file, reason })),
        failed: failed.map(({ file, reason, why }) => ({ file, reason, why })),
      },
      null,
      2,
    )}\n`,
  );
}

// --- Run -------------------------------------------------------------

const client = new Anthropic();

try {
  // Streaming: the spec files plus a large diff make this a long request, and
  // a non-streaming call at this max_tokens risks an SDK HTTP timeout.
  const stream = client.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  const response = await stream.finalMessage();

  if (response.stop_reason === 'refusal') {
    // Not a build failure: the docs are simply left alone this run.
    console.error('Anthropic API declined the request:', JSON.stringify(response.stop_details));
    finish({ drift: false, summary: '' });
    process.exit(0);
  }
  if (response.stop_reason === 'max_tokens') {
    console.error('Response truncated at max_tokens; the edit list would be incomplete.');
    process.exit(1);
  }

  const text = response.content.find((block) => block.type === 'text')?.text;
  if (!text) {
    console.error('No text block in response');
    process.exit(1);
  }

  const result = JSON.parse(text);
  if (!result.drift || result.edits.length === 0) {
    console.log('No drift: the specs still describe the code.');
    console.log(result.summary);
    finish({ drift: false, summary: result.summary });
    process.exit(0);
  }

  const { applied, failed } = applyEdits(result.edits);
  applied.forEach((e) => console.log(`[edit]   ${e.file} — ${e.reason}`));
  failed.forEach((e) => console.log(`[skip]   ${e.file} — ${e.why} (${e.reason})`));
  console.log(`${applied.length} edit(s) applied, ${failed.length} skipped.`);

  finish({ drift: applied.length > 0, summary: result.summary, applied, failed });
} catch (error) {
  if (error instanceof Anthropic.RateLimitError) {
    console.error('Anthropic API rate limited:', error.message);
  } else if (error instanceof Anthropic.APIError) {
    console.error(`Anthropic API error ${error.status}:`, error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
}
```

Replace `«REPO_NAME»`.

### 6.4 `.github/workflows/architecture-docs-drift.yml`

```yaml
name: Architecture docs drift

# Keeps docs/architecture/ honest. On every push to develop that touches source,
# Claude reads the diff against the three specs and proposes corrections for
# anything the code has made wrong or outgrown.
#
# The result is always a PR, never a direct commit to develop:
# - a human reviews doc edits before they become the reference
# - develop is not rewritten by a bot
#
# The path filter deliberately omits docs/**, so merging this workflow's own
# PR cannot trigger another run.
#
# Requires the ANTHROPIC_API_KEY repository secret. Without it the run fails
# loudly rather than silently leaving the docs stale.
on:
  push:
    branches: [develop]
    paths:
      - 'apps/**'
      - 'packages/**'

permissions:
  contents: write
  pull-requests: write

# Queue rather than cancel: each run analyses its own commit range, and a
# cancelled run would drop that range's changes on the floor.
concurrency:
  group: architecture-docs-drift
  cancel-in-progress: false

env:
  DOCS_BRANCH: chore/architecture-docs-drift

jobs:
  drift:
    name: Detect and correct spec drift
    runs-on: ubuntu-latest
    env:
      GH_TOKEN: ${{ github.token }}
    steps:
      - uses: actions/checkout@v4
        with:
          # Full history: the analysed range is computed with git diff/log.
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Compute the pushed range
        id: range
        run: |
          set -euo pipefail
          before='${{ github.event.before }}'
          head='${{ github.sha }}'

          # A new branch, a force-push, or a rewritten history leaves `before`
          # as the null SHA or pointing at an object we no longer have. Fall
          # back to the single commit rather than diffing against nothing.
          if [ -z "$before" ] || [ "$before" = '0000000000000000000000000000000000000000' ] \
             || ! git cat-file -e "$before^{commit}" 2>/dev/null; then
            before="$head^"
          fi

          echo "range=$before..$head" >> "$GITHUB_OUTPUT"
          echo "Analysing $before..$head"

      - name: Collect the diff and commit messages
        env:
          RANGE: ${{ steps.range.outputs.range }}
        run: |
          set -euo pipefail
          # Same source paths as this workflow's trigger — the specs don't
          # describe tests or the docs themselves.
          pathspec=(-- apps packages)

          git diff "$RANGE" "${pathspec[@]}" > diff.txt
          git diff --stat "$RANGE" "${pathspec[@]}" > diffstat.txt
          git log --no-merges --format='- %s%n%b' "$RANGE" "${pathspec[@]}" > commits.txt

          echo "diff: $(wc -c < diff.txt) bytes, $(wc -l < diffstat.txt) files changed"

      - name: Install script dependencies
        run: npm ci --prefix .github/scripts

      - name: Detect drift and edit the specs
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          RANGE: ${{ steps.range.outputs.range }}
          DIFF_FILE: diff.txt
          DIFFSTAT_FILE: diffstat.txt
          COMMITS_FILE: commits.txt
          RESULT_FILE: drift-result.json
        run: node .github/scripts/docs-drift.mjs

      - name: Open or update the docs PR
        run: |
          set -euo pipefail

          if [ "$(jq -r .drift drift-result.json)" != 'true' ]; then
            echo "No drift — specs left untouched."
            jq -r .summary drift-result.json
            exit 0
          fi

          # git diff is the authority on whether anything actually changed:
          # every accepted edit was written to disk, but an edit whose
          # replacement equals the original is a no-op.
          if git diff --quiet -- docs/architecture; then
            echo "Model reported drift but produced no net change."
            exit 0
          fi

          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

          # Rebuild the branch from this commit each run, so the PR always
          # shows current develop plus one docs commit — never a stack of
          # bot commits fixing each other.
          git checkout -B "$DOCS_BRANCH"
          git add docs/architecture
          git commit -m "docs(architecture): sync specs with ${GITHUB_SHA:0:7}"
          git push --force origin "$DOCS_BRANCH"

          {
            jq -r .summary drift-result.json
            printf '\n## Edits applied\n\n'
            jq -r '.applied[] | "- `\(.file)` — \(.reason)"' drift-result.json
            if [ "$(jq -r '.failed | length' drift-result.json)" != '0' ]; then
              printf '\n## Skipped\n\nThese edits were proposed but not applied — check them by hand:\n\n'
              jq -r '.failed[] | "- `\(.file)` — \(.why). Intended: \(.reason)"' drift-result.json
            fi
            printf '\nSource range: `%s`\n' '${{ steps.range.outputs.range }}'
            printf '\n---\n_Proposed by Claude from the diff that landed on develop (architecture-docs-drift.yml). Force-pushed on each qualifying push, so review the head commit rather than the PR history._\n'
          } > body.md

          existing=$(gh pr list --head "$DOCS_BRANCH" --base develop --state open --json number --jq '.[0].number // empty')
          if [ -n "$existing" ]; then
            gh pr edit "$existing" --body-file body.md
            echo "Updated PR #$existing"
          else
            gh pr create --base develop --head "$DOCS_BRANCH" \
              --title 'docs(architecture): sync specs with develop' \
              --body-file body.md
          fi
```

Also add the skill to `CLAUDE.md`'s skills list (`/consult-architecture-docs`).

**Verify:**
- [ ] Merge a small real change to `apps/web` that contradicts a spec sentence (e.g. add a route the API spec says doesn't exist) — the workflow opens a `docs(architecture)` PR correcting exactly that sentence.
- [ ] Merge a pure refactor — the workflow runs and reports "No drift".
- [ ] Merging the docs PR itself does **not** trigger another run (path filter).

---

## Final end-to-end check

Before handing back to the user, confirm the whole system works together:

- [ ] Fresh clone → `pnpm install` → hooks installed → `pnpm run build/lint/typecheck/test` green.
- [ ] All Phase verifies passed (0 through 5, plus 6 if included).
- [ ] `grep -rn '«' --include='*' . --exclude-dir=node_modules` finds nothing.
- [ ] The README documents: the branch model, the merge-commit requirement and why, the breaking-change convention, which version mechanism is authoritative for what, the required secrets, and the Asana setup steps (PAT, `--setup`, `--smoke`).
- [ ] Report to the user: what was built, what they still must do by hand (create secrets, branch protection, Asana custom fields if `--setup` couldn't), and the one-command smoke tests for each subsystem.

The appendices with the full skill files follow.

---

# Appendix A — Portable skills (copy verbatim)

Eight files. Write each exactly as given.

### `.claude/skills/explore-before-coding/SKILL.md`

````markdown
---
name: explore-before-coding
description: Use before writing or editing ANY code in a codebase — new feature, bug fix, refactor, or test. Forces reconnaissance first, finding the canonical example to copy, and verifying that every API you plan to call actually exists. Skip only for pure questions that involve no code changes.
---

# Explore Before Coding

The single biggest gap between strong and weak coding models is not code generation — it is what they do **before** generating code. Weak models pattern-match from training data and produce plausible-looking code that doesn't fit the repo: wrong import paths, invented helper functions, a second way of doing something the repo already does one way. Strong models spend the first minutes reading, and their first draft lands.

## Procedure

### 1. Find the canonical example

Almost every task in an established repo has already been done once, nearby. Before writing anything:

- **Adding a module/endpoint/command?** Find the most recently added one of the same kind and open every file in it. That is your template — copy its shape, folder layout, naming, and registration steps exactly.
- **Fixing a bug?** Find where the behavior lives by following the data, not by guessing filenames. Search for a user-visible string, an error message, a route path, an event name.
- **Adding a test?** Open 2–3 existing tests for similar functionality first. Copy their setup, fixtures, and assertion style.

Check whether the repo's docs (`CLAUDE.md`, `README`, `CONTRIBUTING`, `docs/`) name a reference implementation. Many repos designate one module as the pattern to copy — use it.

### 2. Read the actual code you will touch

- Read every file you plan to edit **in full context around the edit site**, not just the matching lines from a search.
- Read the callers and callees of any function you change. A signature change has a blast radius — know it before you edit.
- Read the imports at the top of the file. They tell you which utilities, loggers, and error types this codebase actually uses.

### 3. Verify every API before you call it

Weak models hallucinate. Counter it mechanically:

- Before calling a function/method you haven't seen in this session, **open its definition** (or grep for it). Confirm the name, parameters, and return type.
- Before importing from a package, check `package.json` (or the equivalent manifest) that the package exists and note its major version — APIs differ across versions.
- Before using a config value, env var, or constant, find where it is defined and how existing code reads it.

If you cannot find it, it probably doesn't exist. Do not invent it — find the repo's real way of doing that thing.

### 4. Mirror, don't introduce

- Match the file's existing style: naming, error handling, logging, comment density — even if you'd personally do it differently.
- Never introduce a new library, framework, or pattern that isn't already in the repo without asking first. The question to ask yourself: "does an existing dependency or in-repo helper already do this?" It almost always does.
- If the repo does something one way in 10 places and a "better" way in 1 place, use the 10-places way.

## Hard rules

| Never | Instead |
|---|---|
| Edit a file you haven't read | Read it first, in full or with generous context |
| Call a function you haven't seen defined | Open the definition and confirm the signature |
| Guess an import path | Grep for how other files import the same thing |
| Add a dependency to solve a problem | Search the repo for the existing solution first |
| Create a new pattern alongside an existing one | Copy the existing pattern, even if imperfect |

## Checklist before your first edit

- [ ] I found and read a canonical example of what I'm building
- [ ] I read every file I'm about to edit
- [ ] Every function/API in my planned change exists and I've seen its signature
- [ ] My change uses only patterns and dependencies already in the repo
````

### `.claude/skills/clarify-and-plan/SKILL.md`

````markdown
---
name: clarify-and-plan
description: Use at the start of any non-trivial task (multi-file change, ambiguous request, new feature, anything estimated over ~30 lines of diff) before writing code. Converts a vague request into stated assumptions, a chosen interpretation, and a step plan where every step has a verification check.
---

# Clarify and Plan

Weak models fail non-trivial tasks in two ways: they silently pick one interpretation of an ambiguous request and build the wrong thing, or they start coding with no definition of "done" and stop at "it compiles." Both are prevented before the first line of code.

## Procedure

### 1. Restate the task and surface ambiguity

Write down, briefly:

- **What is being asked**, in your own words.
- **Your assumptions** — every fact you are treating as true that the user didn't explicitly state ("I assume this endpoint is internal-only", "I assume backwards compatibility matters").
- **Interpretations** — if the request has more than one reasonable reading, list them. Do not pick one silently.

Then decide: ask or proceed?

- **Ask** when the interpretations lead to materially different code, when the change is destructive/hard to reverse, or when a requirement contradicts what you found in the repo.
- **Proceed** when one interpretation is clearly dominant or the difference is trivial — but state the assumption you're proceeding on so the user can correct you cheaply.

One good clarifying question before coding is worth ten apologies after.

### 2. Define "done" as something checkable

Transform the task into verifiable success criteria **before** implementing:

| Vague task | Verifiable goal |
|---|---|
| "Add validation" | "A request with a bad email returns 400; a test proves it" |
| "Fix the bug" | "A test reproducing the bug exists and passes after the fix" |
| "Refactor X" | "Full test suite passes before and after; behavior identical" |
| "Speed this up" | "Measured before/after numbers on the same input" |

If you cannot state how you'll verify the task, you don't understand the task yet — go back to step 1.

### 3. Plan in verifiable steps

For multi-step work, write a short plan where **every step has its own check**:

```
1. Add the new column + migration      → verify: migration runs cleanly up and down
2. Extend the service method           → verify: existing tests still pass
3. Expose in the API layer             → verify: new integration test passes
4. Full suite + lint                   → verify: all green
```

Rules for the plan:

- Order steps so the system stays working after each one when possible.
- Prefer steps you can verify with a command over steps verified "by inspection."
- If a step's check fails, fix it before moving on — don't stack unverified changes.

### 4. Right-size the solution

Before finalizing the plan, apply the simplicity test:

- Does the plan build **only** what was asked? No speculative flexibility, no config options nobody requested, no abstractions for single-use code, no handling of impossible scenarios.
- Is there a simpler approach? If yes, either take it or say why not.
- Estimate the diff. If your plan produces 200 lines where 50 would do, re-plan. The best answer to many requests is a small change to existing code, not new code.

## Hard rules

- Never pick between materially different interpretations silently.
- Never start a multi-file change without written success criteria.
- Never define "done" as "it compiles" or "looks right" — done means a check passed.
- A plan step without a verification is not a step, it's a hope.
````

### `.claude/skills/surgical-diffs/SKILL.md`

````markdown
---
name: surgical-diffs
description: Use whenever editing existing code (as opposed to greenfield files) — bug fixes, feature additions to existing modules, refactors. Enforces minimal-diff discipline - every changed line must trace to the request - and defines the self-review pass to run on your own diff before finishing.
---

# Surgical Diffs

Weak models produce noisy diffs: they reformat untouched lines, "improve" adjacent code, rename things for taste, delete comments they didn't understand, and leave orphaned imports behind. Noisy diffs hide the real change, break unrelated behavior, and destroy reviewer trust. The discipline: **every changed line traces directly to the user's request.**

## While editing

### Touch only what you must

- Don't "improve" adjacent code, comments, or formatting — even obviously bad ones. Mention them; don't fix them.
- Don't refactor things that aren't broken as a side effect of another task.
- Don't reorder imports, functions, or object keys unless the task requires it.
- Don't change quoting style, spacing, or line breaks on lines you aren't otherwise editing. If a formatter exists, let it own formatting.
- Match the file's existing style even where you disagree with it.

### Don't delete what you don't understand

- A comment, guard clause, or seemingly-dead branch may encode a constraint you can't see. If it looks wrong or dead, **flag it in your summary** instead of removing it.
- Never remove pre-existing dead code unless asked. Never edit shipped migrations or other append-only artifacts — add new ones.

### Clean up only your own mess

- Remove imports, variables, helpers, and files that **your** change made unused.
- Leave pre-existing dead code alone.

## The self-review pass (mandatory before finishing)

Read your full diff (`git diff`, including untracked files you added) line by line and interrogate it:

1. **Trace test**: for each changed hunk — which part of the request required this? If you can't answer in one sentence, revert the hunk.
2. **Orphan test**: did my change leave anything unused — imports, variables, params, exports, config keys, test fixtures? Remove the ones I created or orphaned.
3. **Debris test**: any leftover debug prints, commented-out code, TODO notes to myself, or temp files? Remove them.
4. **Scope test**: is anything in the diff a drive-by improvement? Revert it and mention it in prose instead.
5. **Symmetry test**: does the change need companion updates the diff is missing — the other switch branch, the docs that describe this behavior, the config template, the second call site? Grep for siblings of what you changed.

## When you notice something bad outside scope

Say it, don't fix it:

> "Done. Note: `parseWindow()` in the same file has an off-by-one on empty input — unrelated to this change, happy to fix separately."

This gives the user the value of your observation without polluting the diff.

## Hard rules

| Never | Because |
|---|---|
| Reformat lines you aren't functionally changing | Buries the real change in noise |
| Fix unrelated bugs in the same diff | Couples two changes; one reverts with the other |
| Delete code/comments you can't explain | They may encode invisible constraints |
| Leave your own orphans (unused imports, debug prints) | Your mess is in scope; other people's isn't |
| Rename for taste | Churns every call site for zero behavior change |

The test for the whole diff: a reviewer should be able to reconstruct the request just by reading it.
````

### `.claude/skills/respect-the-layers/SKILL.md`

````markdown
---
name: respect-the-layers
description: Use when adding or modifying code in a layered backend service (controllers/resolvers, services, repositories/data access, models) or any codebase with defined module boundaries. Covers which layer code belongs in, one-way dependency flow, and what to do when the "quick" path wants to skip a layer.
---

# Respect the Layers

Layered codebases stay maintainable only if every piece of code lives in its designated layer. Weak models erode this: a query sneaks into a controller "because it's just one line," business logic lands in a route handler, a data model grows behavior. Each violation is small; collectively they make the codebase untestable and unrefactorable. **Where code goes is not a style choice — it's the architecture.**

## The standard shape

Most backend services follow some version of:

```
Transport layer     (controllers, resolvers, route handlers, CLI commands, message consumers)
      ↓
Business layer      (services, use-cases, domain logic)
      ↓
Data-access layer   (repositories, DAOs, query builders)
      ↓
Model layer         (entities, schemas, table definitions)
```

Dependencies point **down only**. Each layer knows the one below it and nothing about the one above.

## Responsibilities per layer

- **Transport**: parse/validate input, call one service method, shape the response, map errors to protocol codes. **No business logic, no data access.** If a handler contains an `if` about domain rules or a query, it's in the wrong layer.
- **Business**: all domain decisions live here. Talks to repositories, other services, and external clients. **Doesn't know the transport** — no request/response objects, no protocol status codes, no transport-specific types in its signatures. Throws domain errors; the transport layer translates them.
- **Data access**: the **only** layer that touches the ORM, query builder, or driver. One repository per aggregate/table, exposing intent-named methods (`findActiveByUserId`), not generic query passthroughs.
- **Models**: shape only — fields, types, relations. No business behavior on model classes.

## Rules that prevent erosion

1. **Skipping a layer means something is missing.** If a controller "just needs one quick query," the missing piece is a service method. Create it — don't reach around.
2. **Boundary types.** What crosses a layer boundary is a plain domain object/DTO, not the layer's internal type. Don't return ORM entities to the transport layer; don't accept framework request objects in services.
3. **Cross-module access goes through the front door.** Module A uses module B's public service interface — never B's repository, internals, or tables directly.
4. **Circular imports mean a boundary is wrong.** If two modules need each other, extract the shared piece downward or merge them. Never "fix" a cycle with a lazy/deferred import.
5. **Follow the repo's dependency mechanism.** If the codebase uses dependency injection, register through the container — don't instantiate services with `new` or create singletons on the side.
6. **Shared code goes in the designated shared place.** Most repos separate app code, internal shared code, and externally-published packages. Check where existing shared helpers live before creating a new location; never deep-import across those boundaries when an alias or package install path exists.

## Before adding code, ask

1. Which layer does this behavior belong to? (Decision → business. Query → data access. Input/output shaping → transport.)
2. Where does the repo put this kind of code today? Find one existing example and put yours in the same kind of place.
3. Does my import direction point downward only? If I'm importing "upward" or sideways into another module's internals, stop.

## Hard rules

| Violation | Correct move |
|---|---|
| Query/ORM call in a controller or resolver | Add a service method that calls a repository |
| Business rule (`if user.plan == ...`) in a route handler | Move the rule into the service |
| Service returns ORM entities across its boundary | Map to a plain DTO at the service edge |
| Module A imports module B's repository | Call B's public service instead |
| "Temporary" layer skip to save time | There are no temporary skips; they never get removed |
````

> In this repo the "layers" read as: route handlers / Server Actions (transport) → lib/domain functions (business) → data clients (data access) — and the package boundaries (`apps/*` may import `packages/*`, never the reverse). The skill's rules apply unchanged.

### `.claude/skills/complete-the-wiring/SKILL.md`

````markdown
---
name: complete-the-wiring
description: Use whenever adding a NEW named thing to a codebase — a config key, env var, module, entity/model, migration, route, enum value, feature flag, event type, or dependency. These almost always require registration in multiple places beyond the file you create; this skill is the procedure for finding every wiring point so nothing is silently undefined at runtime.
---

# Complete the Wiring

The classic weak-model failure when adding something new: create the file, wire the one place the compiler complains about, and stop. But most codebases register named things in places the compiler never checks — deployment manifests, config templates, provider arrays, docs, CI. The result works locally and returns `undefined` in production. **A new thing isn't added until every registration point is updated.**

## The procedure: find a sibling, diff its footprint

Never enumerate registration points from memory. Derive them empirically:

1. **Pick the most recently added sibling** — the last config key, the last module, the last entity of the same kind.
2. **Grep the entire repo for its name** (and its casing variants: `MY_KEY`, `myKey`, `my-key`, `my_key`).
3. **Every place the sibling appears is a place your new thing probably needs to appear.** Work the list explicitly — don't stop at the first few.
4. Better: if the sibling was added in a single commit, `git log -S 'siblingName' --oneline` and read that commit's full file list. That commit **is** the checklist.

## Common wiring points by kind

Use these as prompts for the grep, not as a substitute for it:

- **Config key / env var**: the typed config interface, the enum/constant of key names, the parsing/mapping helper, **every** deployment manifest or blueprint per app/environment, the local template (`local.json`, `.env.example`), docs. Missing a deployment manifest = `undefined` only in deployed environments — the worst kind of bug.
- **Module**: the parent app's module imports, DI providers/exports, route or schema registration (e.g. a GraphQL `include:` list), test bootstrap if it enumerates modules.
- **Entity / model**: the providers/registry file, the migration that creates its table, seed/fixture helpers used by tests.
- **Enum value / event type / flag**: every `switch`/mapping over the enum (search for uses of any existing value), serialization contracts, downstream consumers, constants files the repo says to add to.
- **Dependency**: the right `package.json` (root vs sub-package), the lockfile via a real install command (never hand-edit), license/audit configs if present.

## Verification

- After wiring, grep for **your new name** the same way you grepped the sibling's. Its footprint should match the sibling's, location for location. Any location where the sibling appears and yours doesn't needs a one-sentence justification.
- Compiles-and-tests-pass is **not** sufficient here: deployment manifests, templates, and docs aren't compiled. The sibling-footprint diff is the real check.
- In your summary, state where you registered the thing, so a reviewer can spot a missed location.

## Hard rules

- Never add a named thing in fewer places than its most recent sibling occupies — without explaining the difference.
- Never hand-edit lockfiles or generated registries; run the generator/installer.
- If the repo documents a wiring checklist for this kind of thing (CLAUDE.md, CONTRIBUTING, module README), follow it **and** still do the sibling grep — docs go stale; the sibling is ground truth.
````

### `.claude/skills/test-like-a-user/SKILL.md`

````markdown
---
name: test-like-a-user
description: Use when writing, modifying, or reviewing tests of any kind. Covers testing through the public surface instead of internals, when mocking is legitimate vs. harmful, what actually deserves a test, and how to keep tests as a spec rather than a mirror of the implementation.
---

# Test Like a User

Weak models write tests that mirror the implementation: instantiate a class directly, mock every collaborator, assert that method A called method B. These tests pass while the real system is broken — the guard isn't registered, the DI wiring is wrong, validation is bypassed, the SQL doesn't match the schema. **A test is only worth having if it fails when a user-visible behavior breaks.**

## Test through the front door

Exercise the code the way its real consumer does:

- **HTTP/GraphQL service** → make a real request against a bootstrapped app; assert on status and response body.
- **Library/package** → import through its public entry point, exactly as an installed consumer would — never via internal source paths.
- **CLI** → invoke the command; assert on exit code and output.
- **Worker/consumer** → publish a message through the real entry path; assert on the observable effect.

The full stack between entry point and effect — routing, middleware, guards, validation, serialization, wiring — is exactly where composition bugs live. Testing through the front door covers it for free; instantiating the class directly skips all of it.

## Mock at the system boundary, nowhere else

- **Do** stub things that leave your system: third-party HTTP APIs (with an interceptor like `nock`/`responses`/`WireMock`), clocks, randomness, payment providers.
- **Don't** mock your own code — your services, repositories, or database. If tests need a database, use a real one (local instance or testcontainer). Mocked-DB tests validate your assumptions about the query, not the query.
- When you stub an external API, stub the **real response shape** (copy from docs or a captured response), not a convenient minimal object that hides contract mismatches.
- Follow the repo's existing testing philosophy and harness. If it has integration infrastructure (fixtures, seed helpers, app bootstrap), extend it — don't introduce a parallel mock-heavy style beside it.

## Assert on outcomes, not mechanics

- Assert **what** happened (response body, DB row, emitted event, file content) — not **how** (which internal method was called, in what order, how many times).
- A good test survives a refactor that preserves behavior. If renaming a private method breaks your test, the test is coupled to mechanics.
- Assert specifically. `expect(result).toBeDefined()` catches almost nothing; assert the actual values that constitute correct behavior.

## What deserves a test

Prioritize, in order:

1. **The bug you just fixed** — every bug fix ships with a test that reproduces it (fails before the fix, passes after).
2. **The behavior you just added** — happy path plus the failure modes callers will actually hit (invalid input, missing entity, unauthorized).
3. **Edge cases with real consequences** — empty collections, boundaries, duplicates, concurrency where it matters.

Don't chase coverage numbers by testing getters, trivial mappings, or framework behavior. Coverage thresholds are floors, not targets.

## Keep tests honest

- **Never weaken an assertion, delete, or `.skip` a failing test to get to green.** A failing test is either a real bug (fix the code) or a legitimately changed spec (change the test **and say so explicitly**).
- Each test seeds its own data via shared fixture helpers and doesn't depend on other tests' leftovers or execution order.
- A flaky test is a bug — in the test or the code. Fix it or report it; retrying until green just hides it.
- Watch tests fail at least conceptually: if you wrote a bug-reproduction test after fixing the bug, temporarily revert the fix (or reason it through) to confirm the test would have caught it. A test that can't fail is worse than no test.
````

> For this repo, "front door" means: Testing Library render + user-event for components (query by role/label), Playwright for flows, MSW or route interception for the network boundary.

### `.claude/skills/debug-root-cause/SKILL.md`

````markdown
---
name: debug-root-cause
description: Use when investigating any bug, failing test, error message, or unexpected behavior — before proposing a fix. Enforces reproduce-first debugging, hypothesis testing against evidence, and fixing causes rather than symptoms. Also use when your own change breaks something and quick patches haven't worked.
---

# Debug Root Cause

Weak models debug by pattern-matching: they see an error message, recall a fix that "usually works," and apply it without confirming it applies here. When it doesn't work, they stack another guess on top. Strong models treat debugging as hypothesis testing against evidence. The difference: **never write a fix until you can explain the failure.**

## Procedure

### 1. Reproduce first

- Find the smallest reliable way to trigger the failure — ideally a single test or command.
- If you can't reproduce it, that's your first problem. Don't fix blind; gather more information (exact inputs, environment, logs) until you can.
- Record the exact failing output. This is your baseline — the fix is proven when this exact reproduction passes.

### 2. Read the evidence, fully

- Read the **whole** error output and stack trace, not the last line. The root frame is often mid-trace, below framework noise.
- Read the actual values: log them, print them, inspect them. Do not reason from what values "should" be.
- Check the obvious environmental suspects once, cheaply: wrong directory, stale build artifacts, un-run migrations, outdated dependencies, cached state.

### 3. Locate by bisection, not intuition

When the cause isn't evident:

- **In time**: did this ever work? `git log` / `git bisect` over the suspect range. If your own change broke it, diff against the last known-good state — the bug is in that diff.
- **In space**: cut the failing path in half. Confirm the data is correct at the midpoint; recurse into the broken half. Follow the data flow — where does the value stop being what you expect?
- **In input**: shrink the failing input until removing anything more makes the failure disappear. What remains is the trigger.

### 4. Hypothesize, then test the hypothesis — not the fix

- State the hypothesis precisely: "X fails because Y is null when Z happens."
- Design the cheapest observation that would **disprove** it (a log line, a debugger check, a one-line test) and run it.
- If disproven, discard it fully and form a new one from the new evidence. Do not keep half-believing it.
- Only when a hypothesis survives do you write the fix.

**Three failed guesses = stop.** If you've applied three fixes and the failure persists, your model of the system is wrong. Stop patching, revert experiment debris, and go back to step 2 with fresh eyes.

### 5. Fix the cause, prove it, sweep for siblings

- Fix where the problem **originates**, not where it's noticed. Symptom fixes to recognize and reject in yourself:
  - adding a null check where the crash happens instead of asking why the value is null,
  - try/catch that swallows the error,
  - retries/sleeps around flaky behavior,
  - special-casing the one failing input.
- Prove it: the original reproduction now passes, **and** the surrounding test suite still passes.
- Pin it: if the bug reached this point, no test caught it — add the reproduction as a permanent test.
- Sweep: the same wrong assumption often lives in sibling code. Grep for the pattern you just fixed and check each occurrence.

### 6. Clean up

Remove every debug print, temp file, and experimental hack you added along the way. The final diff should contain the fix and the test — nothing else.

## Hard rules

- No fix before a reproduction.
- No fix you can't explain in one sentence: "it failed because ___, so the fix is ___."
- Root-cause explanations must be supported by an observation you made, not by plausibility.
- A fix that works "and I'm not sure why" is not a fix — keep digging.
````

### `.claude/skills/verify-before-done/SKILL.md`

````markdown
---
name: verify-before-done
description: Use before declaring ANY code change complete, committing, or telling the user "done". Defines what counts as verified (running the code, not reading it), the escalating check sequence, and how to report results honestly when something fails.
---

# Verify Before Done

The most damaging weak-model habit is claiming success without evidence: "I've fixed the bug" after editing a file but never running anything. Code that has only been read is not verified. **A change is done when a check you actually ran proves the intended behavior — not when the code looks right.**

## The check sequence

Run in escalating order; each level catches what the previous can't:

1. **Compile / typecheck** — catches signatures and syntax. (`tsc`, `npm run build`, `cargo check`, `mypy`, …)
2. **Lint** — catches banned patterns and repo rules. Use the repo's own script (`npm run lint`), not a generic invocation.
3. **Focused tests** — run the tests covering what you changed first; fast feedback loop while iterating.
4. **Full relevant suite** — before declaring done, run the whole suite for the affected area. Your change can break tests far from the files you touched.
5. **Exercise the real behavior** — for anything user-facing or runtime-visible, drive the actual flow at least once: hit the endpoint, run the CLI command, execute the script against real input. Tests encode expectations; running the thing reveals surprises.

Find the repo's real commands in `package.json` scripts, `Makefile`, `CI config`, or the README — don't guess. If the repo has a verify/test skill or doc, follow it.

## The verification loop

When a check fails:

1. Read the **entire** error, not just the last line. The root cause is often in the middle of the output.
2. Fix, re-run **the same check**, and only then continue the sequence.
3. Track attempts. If the same check fails 3 times with different fixes, stop patching — your model of the problem is wrong. Step back and re-diagnose (see `debug-root-cause`).

## Forbidden shortcuts

These are the failure modes this skill exists to block:

| Shortcut | Why it's forbidden |
|---|---|
| Weakening an assertion to make a test pass | The test was the spec; you just deleted the spec |
| Deleting or skipping a failing test | Same — silently redefines success |
| Catching and swallowing an exception to stop a crash | Hides the bug; doesn't fix it |
| Marking done because "the diff looks correct" | Reading is not running |
| Running only the one test you wrote | Misses regressions elsewhere |
| "The tests were already failing before my change" (unchecked) | Verify on the base commit before claiming it |

A failing test is telling you the code is wrong **or** the test's expectation is wrong. Changing the expectation is only legitimate when the task explicitly changed the intended behavior — and then say so.

## Honest reporting

Report what actually happened, with evidence:

- **All green**: say what you ran and that it passed. "Build, lint, and the 42-test integration suite pass."
- **Something failed**: say so plainly, include the relevant output, and state your best diagnosis. Never round a failure up to success.
- **Something skipped**: say what you couldn't verify and why ("couldn't run the e2e suite — needs staging credentials"). An honest gap invites help; a hidden gap ships a bug.
- Distinguish **verified** ("the new test reproduces the bug and passes after the fix") from **believed** ("this should also fix the timeout issue, but I couldn't reproduce it").

## Checklist

- [ ] Typecheck/build passes (actually ran it)
- [ ] Lint passes with the repo's own config
- [ ] Tests covering the change pass; full relevant suite passes
- [ ] For behavior changes: I exercised the real flow at least once
- [ ] No assertion was weakened and no test skipped to get to green
- [ ] My report distinguishes what I verified from what I believe
````

---

# Appendix B — Ticket-workflow skills, Asana edition

Four files. Resolve `«PREFIX»` (ticket prefix), `«PROJECT_NAME»` (the Asana project's name), and `«GITHUB_ORG»` as you write them. Keep every command consistent with what you actually built in Phase 3 — if a flag differs, fix the skill, not the script.

### `.claude/skills/plan-tickets/SKILL.md`

````markdown
---
name: plan-tickets
description: Use when turning a PRD, RFC, handoff doc, or design decision into Asana tasks on the «PROJECT_NAME» board — "break this RFC into tickets", "plan the work for X", "create tickets for this doc". Produces a reviewable dry-run folder first, then replays it into Asana with replay.mjs. Not for implementing a ticket that already exists (that is work-ticket).
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

| Field | Epic | Story | Sub-task |
|---|:--:|:--:|:--:|
| `local_id` | ✓ | ✓ | ✓ |
| `type` (`Epic` / `Story` / `Sub-task`) | ✓ | ✓ | ✓ |
| `summary` | ✓ | ✓ | ✓ |
| `priority` (`P1`–`P5`) | ✓ | ✓ | ✓ |
| `labels` (string[]) | ✓ | ✓ | ✓ |
| `story_points` | `null` | Fibonacci 1/2/3/5/8/13 | `null` |
| `description_markdown` | ✓ | ✓ | ✓ |
| `epic_local_id` | — | ✓ | — |
| `parent_local_id` | — | — | ✓ |
| `blocks` / `blocked_by` (local ids) | — | ✓ | — |

`local_id` uses a short initiative tag: `«PREFIX»-CTA-E1` (epic), `«PREFIX»-CTA-1` (story),
`«PREFIX»-CTA-1.2` (sub-task of story 1). **Asana has no issue keys, so after replay the
local ID is the ticket's permanent name** — it goes in commit scopes and PR titles.
`state.json` maps it to the task GID and permalink.

Summaries take an optional layer prefix for board filtering: `[FE]`, `[API]`, `[INFRA]`,
`[QA]`, `[DOCS]`. Omit when the work doesn't split by layer.

**Story description template** — the `## Acceptance` section is what `work-ticket` later
verifies against, so write it as commands and observable outcomes, not intentions:

```markdown
## Context
Why this exists, and what in the codebase it touches today.

## Requirements
- Concrete, file-level where possible.

## Acceptance
- `pnpm turbo run test -- --filter web` passes.
- Navigating to /settings as a signed-out user redirects to /login.
```

Sub-task descriptions are one or two lines — the file to touch and the shape of the change.

**Markdown subset.** Descriptions are converted to Asana `html_notes` by `asana.mjs`.
Supported: headings, paragraphs, `-`/`*` bullets, `1.` ordered lists, `---` rules, and
inline `` `code` ``, `**bold**`, `[text](url)`. **Not** supported: tables, nested lists
(flattened one level), images, task lists. Stick to the subset — anything outside it
degrades on the way to Asana and again on every sync.

### 4. Write the supporting docs

- **README.md** — origin (which doc, which ticket), the design decision that shaped the
  breakdown and *why*, locked decisions, open questions, file table, replay command, forecast
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

| | |
|---|---|
| Priority | P1 blockers/core · P2 important · P3 standard · P4 minor · P5 tech debt |
| Points | 1/2/3/5/8/13. Above 8 means the story should be split. |
| Labels | layer (`frontend`, `api`, `infra`, `qa`, `docs`) + feature tags. Sub-tasks also carry `subtask`. |
| Dependencies | schema → API, API → consumer, implementation → tests: express as `blocked_by` on the dependent story; `replay.mjs` dedupes both directions into one edge. |

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
````

### `.claude/skills/work-ticket/SKILL.md`

````markdown
---
name: work-ticket
description: Use when asked to implement, start, or pick up a ticket by planner ID or Asana link — "work «PREFIX»-CTA-3", "implement the next ticket", "what's ready to pick up". Resolves the ID to its planner row and design context, checks its blockers, and drives implementation against the ticket's own acceptance criteria.
---

# Work a ticket

A ticket reference is not the ticket. The ticket is a row in a dry-run JSONL, and its meaning
depends on the folder's README (which records design decisions and reversals) and on the
tickets that block it. Reading the Asana task alone is how you build the thing that was
already reverted.

**Never guess what a ticket means.** Resolve it.

## 1. Resolve the reference

By planner ID (the normal case — `«PREFIX»-CTA-3`):

```bash
grep -l '"«PREFIX»-CTA-3"' .claude/ticket-planner/dry-runs/*/tickets*.jsonl
jq -r 'select(.local_id=="«PREFIX»-CTA-3")' <that file>
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
node .claude/ticket-planner/sync.mjs --status --keys «PREFIX»-CTA-3 \
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
git log --oneline --grep '«PREFIX»-CTA-1'                    # did it ship here?
node .claude/ticket-planner/board.mjs | grep '«PREFIX»-CTA-1' # what column is it in?
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

- Conventional commit, planner ID in the scope: `feat(«PREFIX»-CTA-3): add CTA deep-link handling`
  — that ID is how `kanban-review` later matches PRs to tickets.
- **Explicit pathspecs** — `git add` the files you changed, never `git add -A`.
- Breaking changes: `type!:` subject (preferred) or a `BREAKING CHANGE:` body line.
- Pre-push runs lint + typecheck + tests; expect a minute or two.
- PRs target `develop`, not `main`.

Asana column moves are not automated — move the card yourself. Nothing in
`.claude/ticket-planner/` ever writes status, assignee, or completion.
````

### `.claude/skills/sync-tickets/SKILL.md`

````markdown
---
name: sync-tickets
description: Use when the planner's local tickets and the Asana board may have drifted — "sync the tickets", "I edited «PREFIX»-CTA-3 in Asana", "did the tickets change", "pull the board changes down". Also before implementing a ticket whose row looks stale, and after hand-editing a tickets.jsonl. Two-way sync between .claude/ticket-planner/dry-runs/*/tickets*.jsonl and the board.
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

Scope any mode with `--keys «PREFIX»-CTA-3,«PREFIX»-CTA-4` (planner IDs). Add `--force` to
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
````

### `.claude/skills/kanban-review/SKILL.md`

````markdown
---
name: kanban-review
description: Use for a status readout of the «PROJECT_NAME» board — "how's the board", "what's in flight", "what can I release", "kanban review", "what's blocked". Reads every open task, cross-references PRs on GitHub, and prints a copy-pasteable report of board health, action items, and what is ready to release.
---

# Kanban review

Read-only. Nothing in this skill writes to Asana or GitHub.

## 1. Read the board

```bash
node .claude/ticket-planner/board.mjs               # open tasks, grouped by section
node .claude/ticket-planner/board.mjs --stale 7     # flag threshold in days (default 7)
node .claude/ticket-planner/board.mjs --tag cta     # filter by tag
```

Needs `ASANA_TOKEN`. Output gives, per task: planner ID, points, days since last update,
priority, name — plus a summary of section counts, stale tasks, and stories missing estimates.

## 2. Cross-reference PRs

For tickets past the first column that involve code (skip spikes, design reviews, pure-docs
tickets), find their PRs. **Run these in parallel** — it's the slow part.

```bash
gh pr list --repo «GITHUB_ORG»/«REPO» --state all --limit 100 \
  --json number,title,state,mergedAt,headRefName,statusCheckRollup,reviewDecision
```

Match on the planner ID (`«PREFIX»-CTA-3`) in the PR title — this repo's convention is
`feat(«PREFIX»-CTA-3): …`. `mergedAt` non-null means merged; otherwise read `state`. If
tickets span other repos in the org, query those too and say which repos you covered.

## 3. Classify

| Signal | Means |
|---|---|
| All PRs merged, task not in a done section | Ready to release |
| Open PR, failing `statusCheckRollup` | Blocked on CI |
| Open PR, `reviewDecision: CHANGES_REQUESTED` | Blocked on review |
| In Progress / In Review, no PR found | Needs verification — either pre-code or the PR title is missing the ID |
| Same section > 7 days | Stale |
| More than 3 in "In Progress" | WIP breach — a small board rarely benefits from more |
| Story with no points or no priority | Unestimated |

## 4. Report

One code block, copy-pasteable into Slack or a doc:

```
📋 «PROJECT_NAME» Board — Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 BOARD HEALTH
  Backlog          : N
  To Do            : N
  In Progress      : N  ← WIP (target ≤ 3)
  In Review        : N
  Ready to Release : N

  Stale > 7d: N (listed below)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 ACTION ITEMS
  1. «PREFIX»-CTA-3 — PR #12 failing e2e; rerun after the fixture fix.
  2. «PREFIX»-CTA-7 — In Review 11 days, no PR found. Confirm the branch was pushed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 RELEASE PLAN
✅ Ready (all PRs merged)
  • «PREFIX»-CTA-1  [FE] CTA deep-link handling
⛔ Blocked
  • «PREFIX»-CTA-5  PR #15 OPEN — changes requested
⏳ NO PR FOUND
  • «PREFIX»-CTA-9  [DOCS] Update contract doc
```

Every action item names a next step. Don't list a problem you can't say what to do about.

## Rules

- Tickets in a done section are out of the release plan — they shipped.
- A ticket with no PR is "needs verification", never "not started" — the PR title may just be
  missing the ID.
- Report what you found. If a repo query failed or credentials were missing, say which, and
  mark that section incomplete rather than implying the board is clean.
````

---

*End of handoff. Written from `novo-notification-service` (July 2026) — source of the original Jira-based planner, husky hooks, and CI release automation this document ports.*
