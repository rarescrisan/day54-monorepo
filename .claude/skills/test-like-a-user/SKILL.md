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
