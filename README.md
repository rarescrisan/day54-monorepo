# web-skeleton

A skeleton React + Next.js monorepo carrying a complete engineering workflow:
Claude Code skills, an Asana-backed ticket planner, git hooks, and CI/CD on a
three-branch promotion model.

It is meant to be forked as the starting point for a new app, or read as a
worked example of the workflow.

```
apps/web              Next.js app (App Router, src/) — explains the repo at /
apps/api              NestJS service — GET /health, nothing else yet
packages/ui           shared React components; button.tsx is the reference
packages/eslint-config, packages/typescript-config   shared configs
.claude/skills        13 skills (engineering discipline + ticket workflow)
.claude/ticket-planner Asana planner scripts and dry-run folders
.github/workflows     CI, promotion PRs, version bump, tag release, docs drift
.github/scripts       CI-only Anthropic scripts (own package.json, npm not pnpm)
docs/architecture     ARCHITECTURE_SPEC / API_SPEC / FEATURE_SPEC
docs/handoff          the spec this repo was built from
```

## Getting started

```bash
pnpm install          # also installs the git hooks via the `prepare` script
pnpm run dev          # web on :3000, api on :3001

pnpm --filter web run dev     # just the Next.js app
pnpm --filter api run dev     # just the Nest service
curl localhost:3001/health    # {"status":"ok","uptimeSeconds":0,…}

pnpm run build        # turbo run build
pnpm run lint         # turbo run lint
pnpm run typecheck    # turbo run typecheck
pnpm run test         # Vitest + Testing Library
pnpm run e2e          # Playwright (builds and starts the app itself)
pnpm run format       # prettier --write .
```

First e2e run needs the browser: `pnpm --filter web exec playwright install chromium`.

---

## Branch model

```
feature/* ──PR──> develop ──promotion PR──> main ──promotion PR──> release
                     │                       │
                     │                       └─ version-bump.yml bumps package.json
                     └─ tag-release.yml mints a vX.Y.Z tag + GitHub Release
```

- **`develop`** is the default branch. Feature PRs target it. Every push mints a
  semver tag from the conventional-commit messages in the range.
- **`main`** is the "current version" branch. Its `package.json` version is the
  version of record.
- **`release`** is the production promotion lane.
- Only `develop → main` and `main → release` are promotion PRs; the AI
  PR-description workflow fires on those two lanes only.

Branch names are enforced by `.husky/pre-push`: the three long-lived branches, or
`feature|feat|chore|fix|bugfix|hotfix|refactor|docs/<name>`.

### Merge commits, not squash — this is load-bearing

Use **merge commits** on `develop` and both promotion lanes.

`tag-release.yml` derives the semver bump from individual commit subjects. A
squash-merge replaces them with the PR title, which never passed through the
`commit-msg` hook — so a non-conventional squash title silently classifies every
release as `patch`. If you switch to squash merges, add a PR-title linter and
accept that tradeoff knowingly.

### Breaking changes

Both forms are accepted by the hook and mapped to a major bump:

- **`type!: subject`** — preferred. `feat(ui)!: drop the appName prop`
- `BREAKING CHANGE:` as a body line — works, but survives less git plumbing.

### Two version mechanisms, on purpose

| Mechanism                           | Lives on  | Answers                         |
| ----------------------------------- | --------- | ------------------------------- |
| `vX.Y.Z` git tags + GitHub Releases | `develop` | What has shipped to integration |
| `package.json` `version`            | `main`    | What was released               |

**Nothing reconciles them.** They drift, and that is by design — tags advance on
every push to `develop`, the `main` version advances once per promotion. Cite the
tag when you mean "what's on develop" and `main`'s `package.json` when you mean
"the released version".

---

## Commits

Conventional Commits, enforced by `.husky/commit-msg` (15-character minimum):

```
feat(WEB-CTA-3): add CTA deep-link handling
fix(api): handle errors correctly in user endpoint
chore(repo): pin dependency versions exactly
```

The scope carries the **planner ID** (`WEB-CTA-3`) — that is how
`/kanban-review` cross-references PRs to Asana tickets. Merge, cherry-pick and
interactive-rebase commits skip validation by design. The regex matches
line-by-line, so a `BREAKING CHANGE:` body line passes under a conventional
subject; the length check counts the whole message.

`.husky/pre-commit` runs `lint-staged` (eslint --fix + prettier on staged files).
`.husky/pre-push` gates on branch name plus `lint typecheck test` — Playwright
stays in CI, it is too slow for a push hook.

---

## Required secrets and repo settings

Set these before the workflows will work end to end.

| Item                                      | Where               | Why                                                                                                                                                           |
| ----------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                       | Repo secret         | `release-pr.yml` and `architecture-docs-drift.yml`. Without it, `release-pr.yml` fails and `version-bump.yml` silently falls back to `patch`.                 |
| `RELEASE_PUSH_TOKEN`                      | Repo secret         | Fine-grained PAT (`Contents: read/write`) owned by an actor on `main`'s branch-protection bypass list. `version-bump.yml` pushes to protected `main` with it. |
| Branch protection on `main` and `release` | Settings → Branches | Require the CI checks and PRs.                                                                                                                                |
| Allow merge commits; disable squash       | Settings → General  | See the merge-commit note above.                                                                                                                              |
| `develop` as default branch               | Settings → General  | Feature PRs target it.                                                                                                                                        |

`ASANA_TOKEN` is **not** a CI secret — the planner runs locally, from your shell.

### CI gotchas worth knowing

1. **A human's `semver:*` override is clobbered by the next push.**
   `release-pr.yml` runs on `synchronize` and re-labels unconditionally. To make
   overrides stick, gate the label step on `github.event.action != 'synchronize'`.
2. **Manual edits to a promotion PR's title/body are overwritten** on every push,
   by the same mechanism. The generated footer says so.
3. **`fetch-depth: 0` is load-bearing** in `release-pr.yml`, `tag-release.yml` and
   `architecture-docs-drift.yml`. A shallow clone produces a _wrong answer_, not
   an error.
4. **`release-pr.yml` uses `pull_request`, not `pull_request_target`** —
   deliberate. Promotion heads are always same-repo branches, and fork PRs must
   not see secrets.
5. **`version-bump.yml` falls back to `patch`** when no semver label is present.
   Watch the first few releases.
6. **No prerelease support** in `tag-release.yml`. The strict `X.Y.Z` tag filter
   exists because git version-sort ranks `v2.0.0-rc.1` _above_ `v2.0.0`.
7. **The two Anthropic scripts have no refusal fallback.** They exit non-zero on
   `stop_reason: "refusal"`. If either workload ever trips a classifier, add the
   server-side `fallbacks` parameter rather than retrying blind.

---

## Asana ticket planner

Tickets live on an Asana board and are planned on disk first. Asana has no
human-readable issue keys, so the **planner ID** (`WEB-CTA-3`) minted in
`.claude/ticket-planner/dry-runs/` is the durable handle — it goes in commit
scopes and PR titles, and `state*.json` maps it to the Asana GID.

```bash
export ASANA_TOKEN='…'                                    # PAT, never committed
node .claude/ticket-planner/asana.mjs --setup              # discover the GIDs
#   → paste the printed CONFIG block into asana.mjs
node .claude/ticket-planner/replay.mjs --smoke             # prove the credentials
node .claude/ticket-planner/board.mjs                      # read-only readout
```

Full setup, the sync model, and the Asana quirks the scripts work around:
[.claude/ticket-planner/asana-planner-guide.md](.claude/ticket-planner/asana-planner-guide.md).

Two invariants: **`replay.mjs` is the only write path for creation** (and is
resumable — state is saved after every API call), and **workflow state is never
automated** — nothing moves a card, completes a task, or changes an assignee.

---

## Claude Code skills

`CLAUDE.md` is loaded automatically. The skills in `.claude/skills/` are invoked
by name (`/work-ticket`, `/plan-tickets`, …); see
[.claude/skills/README.md](.claude/skills/README.md) for the full table and how
they compose. Eight are deliberately repo-agnostic engineering discipline; four
drive the Asana planner; one maintains the architecture specs.

---

## Dependency policy

- **Every version is pinned exactly.** No `^`, no `~`, anywhere. `.npmrc` sets
  `save-exact=true`; `pnpm-lock.yaml` is committed.
- **`minimumReleaseAge: 10080`** in `pnpm-workspace.yaml` — a version published
  in the last 7 days will not install. This is a supply-chain guard: compromised
  releases are usually caught inside that window. There is a
  `minimumReleaseAgeExclude` escape hatch; pin an older version instead.
- **Install scripts are blocked** by default. `allowBuilds` lists the two
  exceptions (`sharp` for Next image optimisation, `unrs-resolver` for the
  ESLint import resolver).
- **Two majors are held deliberately**, at the versions the Turborepo starter
  validates: **ESLint 9** (plugin ecosystem lags 10) and **TypeScript 5.9**
  (TS 7 is a major jump for `typescript-eslint` and the Next plugin). Moving
  either is a deliberate, tested change — not a routine bump.

`packages/eslint-config/base.js` sets `no-explicit-any`, `no-console` and
`import/no-cycle` to **error**. `import/no-cycle` needs three settings to work
and fails _silently_ without them — read the comment there before touching it.
