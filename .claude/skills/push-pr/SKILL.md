---
name: push-pr
description: Ship the current work to GitHub end-to-end — write a proper commit message, push the branch, write a detailed PR description, and open the PR. On later pushes to the same branch, regenerate the description from the cumulative diff and update the open PR. Use whenever the user asks to push, commit and push, "make a PR", "ship this", or open/update a pull request in this repo.
---

# Push & open a PR

Follow every step in order. The goal is that the PR a reviewer sees is fully self-explanatory without reading the diff first.

## 1. Branch

- Never commit directly to `main`, `develop`, or `release`.
- Branch names MUST match the pre-push hook's allowlist:
  `feature/<name>`, `feat/<name>`, `chore/<name>`, `fix/<name>`, `bugfix/<name>`, `hotfix/<name>`, `refactor/<name>`, `docs/<name>`.
- Branch off `origin/develop` (the integration branch) unless the change is a hotfix for `main`.

## 2. Commit message

Review the full staged diff first (`git diff --cached`), then write a conventional-commit message that describes the change from the diff — not from memory of what you intended:

```
<type>(<scope>): <imperative summary, ≤72 chars>

<2–6 lines: what changed and why. Mention anything a reviewer
would otherwise have to discover: new secrets/env vars required,
behavior changes, config knobs, migrations.>

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

Types: `feat`, `fix`, `chore`, `ci`, `docs`, `refactor`, `test`. Scan the staged diff for anything secret-shaped (keys, tokens, PEM blocks) before committing.

## 3. Push

`git push -u origin <branch>`. The pre-push hook runs turbo lint/typecheck/test — if it fails, fix the failure; never bypass with `--no-verify`.

## 4. PR description

Write the description from the **full cumulative diff against the base** (`git diff origin/develop...HEAD`), never from just the latest commit. Write it to a file (scratchpad) and pass it with `--body-file`. Never let GitHub prefill the body from the commit message — a commit message is not a PR description. It MUST be detailed — cover every section that applies; drop only sections that are truly empty:

```markdown
## Ticket

[<planner ID> — <ticket summary>](<Asana permalink>)

## Summary

2–4 sentences: what this PR does and why it exists. Written for
someone with zero context on the conversation that produced it.

## Changes

Bulleted list of every meaningful change, grouped by area/file.
Name files with paths. Call out anything surprising in the diff.

## How it works

For non-trivial logic: a short walkthrough of the flow
(triggers, inputs, outputs, error handling).

## Setup / config required

Secrets to add, env vars, dashboard toggles, migrations —
anything that must happen before or right after merge.

## How to test

Concrete steps or commands a reviewer can run to verify.

## Risks / notes

Known limitations, follow-ups, security considerations.
```

**`## Ticket`** applies when the work carries a planner ID (`WEB-XXX-N` in the branch name, commit scope, or conversation). Resolve the Asana permalink from the planner state files — never guess or search Asana by name:

```bash
jq -r '.issues["<planner-ID>"].permalink // empty' .claude/ticket-planner/dry-runs/*/state*.json
```

If the ID isn't in any state file (or there is no ticket), drop the section. For a sub-task, link the sub-task itself, not its parent story.

End the body with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## 5. Open the PR

```bash
gh pr create --base develop --head <branch> --title "<same as commit summary>" --body-file <path>
```

- Base is `develop` unless the user says otherwise (hotfixes → `main`).
- **Account gotcha in this repo:** git pushes go over the `github-personal` SSH alias (personal account `rarescrisan`), but `gh` may be authenticated as `rarescrisan-novo`, which can't create or edit PRs here. If `gh pr create` fails with a collaborator/permissions error: keep the body file, give the user the compare URL (`https://github.com/rarescrisan/day54-monorepo/compare/develop...<branch>`) plus the exact `gh pr create --body-file` command to run after `gh auth switch --user rarescrisan`.

## 6. After opening

- Report the PR URL.
- Check CI status once (`gh pr checks <number>`); if checks fail, read the failure logs and report the actual cause — distinguish code failures from infra issues (e.g. runner/billing problems).

## 7. Subsequent pushes to the same branch — keep the description current

Every time you push more commits to a branch that already has an open PR (check with `gh pr list --head <branch>`), the description MUST be brought back in sync with the full diff:

1. Regenerate the body from `git diff origin/develop...HEAD` (cumulative, not just the new commit), reusing the same template — update `## Changes`, and revisit `## Summary`, `## Setup / config required`, and `## How to test` if the new commits changed them.
2. Apply it: `gh pr edit <number> --body-file <path>`.
3. If `gh pr edit` fails with the account-permissions error (see step 5), copy the body to the clipboard (`pbcopy < <path>`), tell the user it's ready to paste into the PR's edit box, and give them the `gh pr edit --body-file` command to run after `gh auth switch --user rarescrisan`.

A PR whose description describes only the first commit is treated as a bug in this flow, not an acceptable state.
