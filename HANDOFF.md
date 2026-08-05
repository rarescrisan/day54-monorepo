# Toolkit handoff — porting this repo's skills & git workflows to another repo

This repo runs a Claude-Code-driven development system: coding-discipline skills,
an Asana ticket planner with two-way sync, husky hooks that enforce commit and
branch hygiene, and GitHub Actions that close the loop from merged PR back to the
ticket board.

This document is the portable package manifest for **the skills and the git/ticket
workflow only**. It deliberately does not carry over this repo's application stack
(frameworks, package manager, linters, CI build pipeline) — those belong to each
repo. The one piece of tooling that travels is husky, because the commit-message
and branch-name hooks are what make the workflow enforceable.

It has two audiences:

- **A human** copying the toolkit into another repo — read "What's in the box",
  "How the pieces work", and the copy manifest.
- **A coding agent (Claude Code)** asked to apply it in the target repo — follow
  "For the adopting agent" below. **Do not skip the recon or the interview.**

---

## For the adopting agent — read this first

If you are Claude Code running in a repo that is _not_ this one, and this document
plus the copied files are your input, follow this procedure exactly:

1. **Recon before asking.** Run the **Recon checklist** (below, before the
   interview) and attempt to answer _every_ interview question from the repo and
   its GitHub settings first. Most of section C and D is discoverable. Never ask
   a question the repo already answers — present the detected value for
   confirmation instead ("I found X — correct?").
2. **Run the interview** for whatever recon could not settle — the Asana
   questions (section B) and the scope questions (section E) almost always need
   the human. Ask in grouped batches, not one at a time. Every blank in the
   Adaptation Map must be filled by either recon or an interview answer before
   you write anything.
3. **Present an adoption plan**: which components will be installed, which will be
   skipped and why, and the concrete value replacing each hardcoded one. Wait for
   approval.
4. **Apply in the order given** in "Application order", verifying each step before
   the next. Anything that talks to Asana or GitHub gets a smoke test before real
   use.
5. **Report honestly.** A step you could not verify is reported as unverified, not
   as done.

**Out of scope — do not port:** this repo's CI build workflow, lint/format
tooling, code-style guidelines, or anything specific to its application stack.
If the target repo wants pre-push checks, wire in _its own_ existing commands;
never install this repo's toolchain to satisfy a hook.

---

## What's in the box

| Component                | Path(s)                                                                                                                                                                     | Portability                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Behavioral guardrails    | `CLAUDE.md`                                                                                                                                                                 | Adapt — skills list carries over; ticket-ID section needs the new prefix; strip stack-specific references |
| 8 discipline skills      | `.claude/skills/{explore-before-coding, clarify-and-plan, surgical-diffs, respect-the-layers, complete-the-wiring, test-like-a-user, debug-root-cause, verify-before-done}` | **Copy as-is** — deliberately repo-agnostic                                                               |
| 4 ticket-workflow skills | `.claude/skills/{plan-tickets, work-ticket, sync-tickets, kanban-review}`                                                                                                   | Adapt — board name, repo slug, branch names, ID prefix                                                    |
| Ship-it skill            | `.claude/skills/push-pr`                                                                                                                                                    | Adapt — base branch, branch allowlist, one repo-specific step to delete                                   |
| Architecture-docs skill  | `.claude/skills/maintain-architecture-docs`                                                                                                                                 | Optional — requires bootstrapping `docs/architecture/` specs first                                        |
| Ticket planner scripts   | `.claude/ticket-planner/{asana.mjs, replay.mjs, sync.mjs, board.mjs, mark-done.mjs}`                                                                                        | Copy, then run `--setup` to fill the CONFIG block                                                         |
| Planner manual           | `.claude/ticket-planner/asana-planner-guide.md`                                                                                                                             | Copy as-is — setup, sync model, every known Asana quirk                                                   |
| Dry-run scaffold         | `.claude/ticket-planner/dry-runs/README.md`                                                                                                                                 | Copy the README only — **not** the example initiative folders                                             |
| Env template             | `.claude/.env.sample`                                                                                                                                                       | Copy (never copy a real `.env`)                                                                           |
| Commit hooks (husky)     | `.husky/{commit-msg, pre-push}`                                                                                                                                             | Adapt — keep the commit-format and branch-name enforcement; swap or drop the stack-specific check command |
| Board ↔ repo loop        | `.github/workflows/asana-sync.yml`                                                                                                                                          | Adapt — base branch, target section, needs `ASANA_ACCESS_TOKEN` secret                                    |
| Release train            | `.github/workflows/{tag-release, release-pr, version-bump}.yml`                                                                                                             | Optional — assumes the develop/main promotion flow and merge commits                                      |
| Docs-drift backstop      | `.github/workflows/architecture-docs-drift.yml`                                                                                                                             | Optional — only with the architecture-docs skill; needs `ANTHROPIC_API_KEY`                               |

**Not in the box** (stays behind, on purpose): `.github/workflows/ci.yml`,
`.husky/pre-commit`, `.claude/WRITING_GUIDELINES.md`, and every lint/format/build
setting — all of it is this repo's application stack, not the workflow.

**Requirements:** Node ≥ 20.11 for the planner scripts (they use
`import.meta.dirname`, zero npm dependencies). `gh` CLI authenticated with an
account that can open PRs and set repo secrets. An Asana account (free tier works
in degraded mode — see below).

---

## How the pieces work

### The skills system

The 8 discipline skills encode senior-engineer working procedure and compose in
task-lifecycle order (see `.claude/skills/README.md`):

> explore-before-coding → clarify-and-plan → surgical-diffs + respect-the-layers +
> complete-the-wiring → test-like-a-user → debug-root-cause (on failure) →
> verify-before-done

They reference no repo specifics and copy verbatim. The `CLAUDE.md` in the target
repo should list them with their trigger conditions, as this repo's does — that
listing is what makes Claude reach for them.

### The Asana ticket planner

The full manual is `.claude/ticket-planner/asana-planner-guide.md` and travels
with the scripts. The model in brief:

- **Planning happens on disk first.** Every initiative becomes a folder under
  `.claude/ticket-planner/dry-runs/<slug>/` containing `tickets-*.jsonl` (Epics,
  Stories, Sub-tasks as one JSON object per line), a `README.md` recording design
  decisions and open questions, `recommended-order.md` (dependency-aware build
  order), and `asana-map.md`. The folder is reviewed and approved _before_
  anything touches Asana.
- **`replay.mjs` is the only write path for creation.** Four passes (epics →
  stories, multi-homed onto the board → dependencies → sub-tasks), state saved to
  `state-*.json` after every API call, so any crash resumes with an identical
  re-run. `--smoke` creates one throwaway task to prove credentials.
- **Planner IDs are the durable handles.** Asana has no issue keys; `WEB-CTA-3`
  → GID/permalink lives only in `state*.json`. IDs go in commit scopes and PR
  titles (`feat(WEB-CTA-3): …`) — that is how PRs are matched back to tickets.
  Never identify a task by name; never renumber IDs after a replay. **The dry-run
  folders including state files are committed** — losing a state file orphans the
  board.
- **The planner only manages tasks it created.** Cards that already exist on the
  board stay visible in `board.mjs` output but have no planner ID; they can only
  be adopted (`sync.mjs --pull-new`) if they hang off an epic or story the
  planner already maps.
- **`sync.mjs` reconciles drift field-by-field** (summary, description, labels,
  priority, points) against a recorded baseline, so direction is _known_
  (push/pull/conflict), never guessed. No auto-merge; conflicts are resolved
  per-ticket with `--keys … --force`. Workflow state — column, completion,
  assignee — is never synced or automated by the scripts.
- **`board.mjs` is read-only** status; `mark-done.mjs` is called by CI (below) to
  stamp `status: done` and recompute the order file after a merge.
- **Credentials:** the scripts read `ASANA_TOKEN` or `ASANA_ACCESS_TOKEN` from the
  environment (or `.claude/.env`, which is gitignored). Never committed, never on
  a logged command line.
- **Config:** workspace/project/field GIDs are hardcoded in a CONFIG block at the
  top of `asana.mjs`, filled once by `node .claude/ticket-planner/asana.mjs
--setup` (interactive: pick workspace → pick project → assignee policy → detect
  or create the Priority and Story Points custom fields).
- **Free Asana tier** = degraded mode, supported: custom fields and dependencies
  are paid features; leave their GIDs `null` and priority/points live in the
  JSONL only, encoded as tags (`P1`…`P5`, `pts:3`) on the board.
- **Descriptions use a strict markdown subset** (h1/h2, bullets, ordered lists,
  bold/italic/inline code, links, fenced code, `---`). Tables, nested lists, and
  images do not survive the round-trip to Asana `html_notes` and will report
  phantom drift forever. Stay inside the subset.

The four ticket skills drive this: `plan-tickets` (doc → dry-run → approval →
replay → `--adopt` baseline), `work-ticket` (resolve ID → load folder context →
verify sync → check blockers → implement against the ticket's own `## Acceptance`
bullets → report), `sync-tickets` (the reconcile procedure), `kanban-review`
(read-only board + PR cross-reference report).

### The git flow

- **Branches:** long-lived `main`, `develop` (integration), `release`. Work
  branches must match `feature/ feat/ chore/ fix/ bugfix/ hotfix/ refactor/
docs/` + name — enforced by the pre-push hook. Branch names are descriptive;
  the ticket ID goes in the commit scope, not the branch.
- **Hooks (husky) — the enforceable part of the workflow:** `commit-msg` enforces
  Conventional Commits (`type(scope)!?: subject`, ≥15 chars; `!` marks breaking —
  the release train derives semver from these). `pre-push` enforces the
  branch-name allowlist above; its final line also runs this repo's own checks —
  in the target repo, replace that line with the target's check command or delete
  it. Hooks are never bypassed with `--no-verify`. Note husky itself is an npm
  package: a repo with no `package.json` installs the same two hook bodies via
  `git config core.hooksPath` or its existing hook manager instead.
- **PRs target `develop`.** The `push-pr` skill writes the commit message from the
  staged diff, the PR body from the _cumulative_ diff against the base
  (Ticket / Summary / Changes / How it works / Setup / How to test / Risks), links
  the Asana permalink resolved from the planner state files, and keeps the
  description regenerated on every subsequent push.
- **On merge into `develop`,** `asana-sync.yml` closes the loop twice over: one
  job comments the PR link on the linked Asana task(s), moves them to the target
  section, and/or marks them complete (tasks linked via Asana URL in the PR body
  or planner ID in the PR title); an independent job extracts planner IDs from the
  PR title, runs `mark-done.mjs`, and **commits the updated `state*.json` +
  `recommended-order.md` directly back to the base branch** with `[skip ci]`.
  Branch protection that forbids direct pushes blocks this job — it needs a
  bypass for the Actions bot, a PAT, or the fallback of running `mark-done.mjs`
  manually. Pull `develop` before starting the next ticket.
- **Releases (optional adoption):** `tag-release.yml` tags every push to
  `develop` with a semver derived from conventional commit messages — **this
  requires merge commits; squash-merging degrades everything to a patch bump**.
  Promotion PRs `develop → main` get their title/description/semver label written
  by Claude (`release-pr.yml`, needs `ANTHROPIC_API_KEY`); on merge,
  `version-bump.yml` bumps the version recorded on `main` per the label (it
  assumes a `package.json` — adapt or skip in non-JS repos).
- **Docs drift (optional):** `architecture-docs-drift.yml` has Claude re-read
  `docs/architecture/` against every source push to `develop` and open a
  correction PR. It is the backstop for the `maintain-architecture-docs` skill,
  whose primary rule is: a change that alters what a spec describes updates that
  spec in the same commit. Opening PRs from a workflow requires the org/repo
  Actions setting "Allow GitHub Actions to create and approve pull requests".

---

## Copy manifest

From this repo into the target repo root:

```bash
SRC=/path/to/day54   # this repo
DEST=.               # target repo root

# Skills (all of them; drop maintain-architecture-docs if not adopting the docs system)
mkdir -p .claude && cp -R $SRC/.claude/skills .claude/

# Planner: scripts + guide + dry-runs scaffold, NOT the example initiatives
mkdir -p .claude/ticket-planner/dry-runs
cp $SRC/.claude/ticket-planner/*.mjs .claude/ticket-planner/
cp $SRC/.claude/ticket-planner/asana-planner-guide.md .claude/ticket-planner/
cp $SRC/.claude/ticket-planner/dry-runs/README.md .claude/ticket-planner/dry-runs/
cp $SRC/.claude/.env.sample .claude/

# Hooks — commit-msg and pre-push only (pre-commit is this repo's lint stack)
mkdir -p .husky
cp $SRC/.husky/commit-msg $SRC/.husky/pre-push .husky/

# Workflows — asana-sync is the core; the release train and docs-drift are opt-in
mkdir -p .github/workflows
cp $SRC/.github/workflows/asana-sync.yml .github/workflows/
# optional: tag-release.yml release-pr.yml version-bump.yml architecture-docs-drift.yml

# Guardrails — a starting point to adapt, not final
cp $SRC/CLAUDE.md .
```

**Never copy:** `.claude/.env` (may hold a real token),
`.claude/ticket-planner/dry-runs/<initiative>/` folders (they map _this_ repo's
tickets to _this_ board — meaningless and misleading elsewhere),
`.github/workflows/ci.yml`, `.husky/pre-commit`, or
`.claude/WRITING_GUIDELINES.md` (all stack-specific, out of this handoff's scope).

**Never overwrite:** if the target repo already has a `CLAUDE.md` or a
`.claude/` directory, merge into the existing content — a blind `cp` here
destroys the repo's own instructions.

Also ensure the target repo's `.gitignore` covers `.claude/.env`.

---

## Adaptation map — every hardcoded value that must change

Nothing below is optional to review. Recon and interview answers (§ next) fill
the blanks.

| Where                                                                                | Hardcoded today                                                                                                                                                                               | Replace with                                                                                                       |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `.claude/ticket-planner/asana.mjs` CONFIG block                                      | This board's workspace/project/field GIDs                                                                                                                                                     | Output of `node .claude/ticket-planner/asana.mjs --setup` in the target repo                                       |
| Planner ID scheme (everywhere: skills, CLAUDE.md, examples)                          | `WEB-<INITIATIVE>-N` / `-E1` / `-N.M`                                                                                                                                                         | Their prefix (Q9) — keep the epic/story/sub-task shape                                                             |
| `plan-tickets`, `sync-tickets`, `kanban-review`, `work-ticket` SKILL.md descriptions | "the Web Skeleton board"                                                                                                                                                                      | Their board name (Q4)                                                                                              |
| `kanban-review` SKILL.md step 2                                                      | `gh pr list --repo notablecap/web-skeleton`                                                                                                                                                   | Their `org/repo` (Q18)                                                                                             |
| `push-pr` SKILL.md                                                                   | Base branch `develop`; branch allowlist; **step 5's "Account gotcha" and step 7.3** (this repo's two-GitHub-accounts workaround — delete unless they have the same problem); compare-URL slug | Q11, Q15, Q18                                                                                                      |
| `work-ticket` SKILL.md step 8                                                        | PRs target `develop`; the note about what pre-push runs                                                                                                                                       | Q11; describe the target repo's own hook behavior                                                                  |
| `.husky/commit-msg`                                                                  | Conventional-commit types list, 15-char minimum                                                                                                                                               | Usually keep as-is; confirm against existing conventions (Q13, Q14)                                                |
| `.husky/pre-push`                                                                    | Branch regex; final line runs this repo's own check command                                                                                                                                   | Q15 for the regex; Q16 — swap in the target repo's check command or delete that line                               |
| Hook installation                                                                    | Husky bootstrap assumes a `package.json`                                                                                                                                                      | Q17 — husky if the repo has npm, otherwise `core.hooksPath` or the existing hook manager                           |
| `.github/workflows/asana-sync.yml`                                                   | Trigger branch `develop`; `ASANA_TARGET_SECTION: "Done"`; `ASANA_MARK_COMPLETE: "true"`; planner-ID regex (generic — verify it matches their prefix); direct push to the base branch          | Q8, Q9, Q11 — and Q12: branch protection needs a bypass/PAT for the bookkeeping push, or that job becomes manual   |
| `.github/workflows/{tag-release,release-pr,version-bump}.yml`                        | develop/main/release promotion model; merge-commit assumption; `version-bump` edits a `package.json`                                                                                          | Adopt only if Q11/Q13 match; otherwise skip                                                                        |
| `CLAUDE.md`                                                                          | Skill list (fine); "Ticket IDs" section (`WEB-CTA-3` examples); the `@.claude/WRITING_GUIDELINES.md` reference and other stack-specific lines                                                 | Q2 (merge with any existing CLAUDE.md), Q9; strip what doesn't apply — this handoff does not port code-style rules |
| `maintain-architecture-docs` SKILL.md + drift workflow                               | `docs/architecture/{API_SPEC,ARCHITECTURE_SPEC,FEATURE_SPEC}.md`                                                                                                                              | Bootstrap the three specs from the target codebase first, or skip the component (Q20)                              |
| Repo secrets                                                                         | `ASANA_ACCESS_TOKEN`; `ANTHROPIC_API_KEY`                                                                                                                                                     | `gh secret set …` in the target repo (Q19)                                                                         |

---

## Recon checklist — answer before asking

Run this in the target repo **before** the interview. Each row feeds the
question(s) named; a detected value is presented to the user for confirmation,
not re-asked from scratch. Treat failures (no `gh` auth, 403s) as answers too —
they mean a section D conversation.

| What to check                           | How                                                                                                                                                                                                | Feeds    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Node version                            | `node --version` (need ≥ 20.11)                                                                                                                                                                    | Q1       |
| Existing Claude config                  | `ls CLAUDE.md .claude/ 2>/dev/null`                                                                                                                                                                | Q2       |
| Existing ticketing hints                | `.github/ISSUE_TEMPLATE/`; Jira/Linear/Asana URLs in recent PR bodies (`gh pr list --state all --limit 20 --json body,title`)                                                                      | Q3       |
| Remote + org/repo                       | `git remote -v`                                                                                                                                                                                    | Q18      |
| `gh` identity & repo access             | `gh auth status`; `gh repo view --json viewerPermission`                                                                                                                                           | Q18, Q19 |
| Branch inventory & default branch       | `git branch -r`; `gh repo view --json defaultBranchRef` — does a `develop`-equivalent exist?                                                                                                       | Q11      |
| Protection on the integration branch    | `gh api repos/<org>/<repo>/branches/<branch>/protection` (404 = unprotected); note `required_pull_request_reviews` and push restrictions                                                           | Q12, Q14 |
| Allowed merge methods + actual practice | `gh repo view --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed`; `git log --merges --oneline -10 <integration-branch>`                                                              | Q13      |
| Commit conventions already in use       | `git log --oneline -30` — what share already matches `type(scope): …`?                                                                                                                             | Q13, Q14 |
| Contributor count (solo vs team)        | `git shortlog -sn --since="6 months ago"`                                                                                                                                                          | Q14      |
| Existing branch-name patterns           | `git branch -r --format='%(refname:short)'` — is there already a naming convention?                                                                                                                | Q15      |
| Candidate pre-push check commands       | `package.json` scripts, `Makefile`, `justfile`, existing CI steps                                                                                                                                  | Q16      |
| Hook manager & husky viability          | `ls .husky lefthook.yml .pre-commit-config.yaml 2>/dev/null`; `git config core.hooksPath`; `test -f package.json`                                                                                  | Q17      |
| Actions status & workflow permissions   | `ls .github/workflows/`; `gh api repos/<org>/<repo>/actions/permissions`; `gh api repos/<org>/<repo>/actions/permissions/workflow` (default token permissions, `can_approve_pull_request_reviews`) | Q19      |

What recon **cannot** answer — always ask the human: everything Asana-side
except stray URLs (Q3–Q10: system of record, board choice, tier, existing
cards, assignee, sections, prefix, PAT ownership), the scope decisions (Q20,
Q21), and any "should we" question where recon only found the current state,
not the intent.

---

## The interview

Ask these in the target repo before changing anything — minus whatever the recon
checklist already answered (confirm those instead). Batch them. Record the
answers — they parameterize the Adaptation Map.

**A. Basics**

1. Is Node ≥ 20.11 available where the planner scripts will run? _(They use
   `import.meta.dirname` and have zero npm dependencies — Node is their only
   requirement, regardless of the repo's own stack.)_
2. Is there an existing `CLAUDE.md` or `.claude/` directory whose content must be
   merged rather than overwritten?

**B. Asana**

3. Is Asana actually the team's system of record for engineering work — or does
   work already live in Jira, Linear, or GitHub Issues? _(If tickets live
   elsewhere, adopting the planner creates a shadow-tracking system. Settle this
   before any other Asana question.)_
4. Which Asana workspace and project (board) will this use — an existing board or
   a new one? _(`--setup` needs to know what to pick; skill descriptions name the
   board.)_
5. Paid or free Asana tier? _(Custom fields — Priority, Story Points — and task
   dependencies are paid. Free tier runs degraded mode: those live in the JSONL
   only, encoded as tags on the board.)_
6. Does the board already have live tasks? _(The planner only manages tasks it
   created — pre-existing cards stay unmapped and show as "no planner ID" in
   reviews. Acceptable, or should this start on a fresh board?)_
7. Should new tasks be auto-assigned to someone, or created unassigned?
8. What are the board's sections/columns, and which section should a merged PR's
   task move to? Should merge also mark the task complete? _(Fills
   `ASANA_TARGET_SECTION` and `ASANA_MARK_COMPLETE` in asana-sync.yml.)_
9. Pick a planner-ID prefix (this repo uses `WEB-`, e.g. `WEB-CTA-3`). Short,
   uppercase, stable — it becomes the permanent handle in commit scopes and PR
   titles.
10. Whose Asana personal access token goes in the `ASANA_ACCESS_TOKEN` repo
    secret? _(Comments and completions in Asana will appear as that user; a
    service account is cleaner if available.)_

**C. Git flow**

11. What is the integration branch (this system assumes `develop`, promoting to
    `main`)? If the repo only has `main`, do you want to create the
    develop/main structure, or collapse the whole flow onto `main`? Do you want
    the full release train (tag-release, release-pr, version-bump) or just
    asana-sync?
12. Is the integration branch protected against direct pushes? _(asana-sync's
    bookkeeping job pushes `status: done` stamps straight to it from Actions.
    Protection blocks that silently on every merge — the fix is a bypass rule
    for the Actions bot, a PAT secret, or accepting manual `mark-done.mjs`
    runs.)_
13. What merge strategy do PRs use — merge commits or squash? _(tag-release
    derives semver from commit messages; squash titles degrade every release to
    a patch bump. This repo uses merge commits for exactly that reason. The
    commit-msg hook's conventional format is what makes the derivation work.)_
14. Solo repo or a team? Do PRs require review approvals? _(Two consequences:
    every contributor's commits start being rejected by the commit-msg hook the
    day it lands — the team needs warning and buy-in; and the end-to-end
    acceptance test below requires actually merging a PR, so an approver is part
    of the install.)_
15. Keep the branch-name allowlist (`feat/… fix/… chore/…` etc.) or adapt it to
    an existing convention?
16. Should pre-push also run the repo's own checks before pushing? If so, what is
    the exact command? _(The hook ships with this repo's command on its last
    line — it must be swapped for the target's or removed. Never install this
    repo's toolchain to satisfy the hook.)_
17. Is there an existing git-hooks manager (husky, lefthook, pre-commit
    framework)? And does the repo have a `package.json`? _(husky is an npm
    package — without a `package.json`, install the two hook bodies via
    `git config core.hooksPath` or the existing manager instead.)_

**D. GitHub & secrets**

18. What is the `org/repo`, and is `gh` authenticated as an account that can open
    PRs and set repo secrets there? _(kanban-review and push-pr shell out to
    `gh`.)_
19. Are GitHub Actions enabled and billed for this repo — and does the org
    restrict them? _(asana-sync needs `contents: write`; docs-drift needs the
    "Allow GitHub Actions to create and approve pull requests" setting.
    Org-level policy overrides the workflow's own `permissions:` block. If
    Actions are off, the hooks and skills still work — the board loop just
    becomes a manual step.)_ And may I add repo secrets: `ASANA_ACCESS_TOKEN`
    (asana-sync), and — only if adopting release-pr / docs-drift —
    `ANTHROPIC_API_KEY`?

**E. Scope**

20. Which optional components are in: release train? architecture-docs system
    (requires writing the three specs first)?
21. Any org-managed policy (managed CLAUDE.md, allowed remotes, secret-scanning
    hooks) this setup must not conflict with?

---

## Application order

Each step has a check; do not proceed past a failing check.

1. **Discipline skills + CLAUDE.md.** Copy the 8 skills; merge with any existing
   CLAUDE.md (Q2); adapt the skill list and ticket-ID section; strip its
   stack-specific lines. → _Check: new Claude session lists the skills and
   invokes one on demand._
2. **Hooks.** Port `commit-msg` and `pre-push` with the target repo's branch
   regex and check command (or no check command). Install via husky if the repo
   has npm, otherwise `core.hooksPath` or the existing manager (Q17). If it's a
   team repo (Q14), announce the new commit rules before landing them. →
   _Check: a wrong-format commit message is rejected; a disallowed branch name
   blocks push._
3. **Planner.** Copy scripts + guide; user exports `ASANA_TOKEN`; run
   `node .claude/ticket-planner/asana.mjs --setup`; paste the CONFIG block into
   `asana.mjs`; then `node .claude/ticket-planner/replay.mjs --smoke` and delete
   the throwaway task in the UI. → _Check: smoke task permalink printed;
   `board.mjs` prints the board._
4. **Ticket skills.** Apply the Adaptation Map rows for the four ticket skills +
   push-pr. → _Check: grep the skills for `WEB-`, `Web Skeleton`, `notablecap`,
   `develop` — every hit is either replaced or deliberately kept._
5. **asana-sync.** Set the `ASANA_ACCESS_TOKEN` secret; adapt the workflow env;
   apply the branch-protection decision from Q12. → _Check: plan one tiny real
   ticket via `plan-tickets`, implement it via `work-ticket`, ship via
   `push-pr`, get it merged — including any required approvals (Q14) — and
   confirm the Asana task gets the PR comment and completion/section move, and
   the bookkeeping commit stamps `status: done` in the state file._ (This
   end-to-end run is the real acceptance test for the whole port.)
6. **Optional tier.** Release train and/or architecture-docs system, per the
   interview. → _Check per component: tag appears on the integration branch after
   a merge; promotion PR gets an AI description and semver label; drift workflow
   opens a PR when a spec is knowingly violated._

---

## Gotchas that travel with the system

- **`state*.json` files are the only planner-ID → Asana mapping. Commit them;
  losing one orphans every task it maps.** The asana-sync workflow also commits
  to them from CI — always pull the integration branch before starting the next
  ticket.
- **Branch protection vs the bookkeeping job:** asana-sync's second job pushes
  directly to the integration branch. If that branch forbids direct pushes, the
  job fails on every merge and the planner files silently drift from Asana —
  give the Actions bot a bypass, use a PAT, or run `mark-done.mjs` manually.
- Asana GIDs are strings bigger than 2^53 — never `parseInt`, never `==`.
- A story that "exists but isn't on the board" was created but not multi-homed;
  re-run replay, don't drag cards in the UI to fix state problems.
- Phantom sync drift on an untouched ticket almost always means its description
  strayed outside the markdown subset (a table or nested list).
- `--force` deliberately requires `--keys`: conflict resolution is per-ticket and
  human-decided, never board-wide.
- The `[skip ci]` on the planner bookkeeping commit is what stops asana-sync's
  own commit from triggering the push-to-develop workflows — keep it if you edit
  that commit message.
- Squash merges silently break semver derivation in tag-release; either use merge
  commits or accept patch-only bumps.
- Exit code 2 from any planner script always means "fix your environment"
  (missing token or CONFIG), never a script bug.

For anything Asana-specific not covered here, `asana-planner-guide.md` has the
full quirk table and troubleshooting section — it ships with the scripts.
