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
