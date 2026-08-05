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
