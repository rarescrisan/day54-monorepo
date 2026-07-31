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

## Repo-specific skills

| Skill | When it fires |
|---|---|
| [consult-architecture-docs](consult-architecture-docs/SKILL.md) | Before reconstructing how the app works from source — read the specs in `docs/architecture/` first |

## How they compose on a typical task

1. **explore-before-coding** — read the code, find the pattern to copy.
2. **clarify-and-plan** — surface assumptions, write verifiable steps.
3. **surgical-diffs** + **respect-the-layers** + **complete-the-wiring** — make the change correctly and minimally.
4. **test-like-a-user** — pin the behavior with a real test.
5. **debug-root-cause** — when anything fails, diagnose instead of guessing.
6. **verify-before-done** — prove it, then report honestly.
