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
