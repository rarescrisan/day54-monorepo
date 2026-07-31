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
