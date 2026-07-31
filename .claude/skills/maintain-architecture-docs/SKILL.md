---
name: maintain-architecture-docs
description: Use whenever a change touches the app's structure, HTTP surface, or user-facing behavior — new routes/Server Actions, new workspaces or dependencies between them, new/changed features, new data stores. Keeps docs/architecture/ (API_SPEC, ARCHITECTURE_SPEC, FEATURE_SPEC) accurate — consult before coding, update in the same change. Also use when asked "are the docs up to date" or to fix spec drift.
---

# Maintain Architecture Docs

Specs that drift from the code are worse than no specs: readers trust them, act on
them, and build on wrong assumptions. The discipline: **a change that alters what a
spec describes updates that spec in the same commit** — docs are part of the diff,
not a follow-up.

The specs live in `docs/architecture/`:

| File                   | Owns                                                                                                                  | Update when…                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `ARCHITECTURE_SPEC.md` | System structure: workspaces, boundaries, dependency direction, data stores, build pipeline                           | You add/remove/rename a workspace, change what may import what, add a database or external service, change the pipeline |
| `API_SPEC.md`          | Every HTTP-reachable surface: route handlers, Server Actions, middleware — auth, request/response shape, side effects | You add/remove/change an endpoint or Server Action, or change its auth, inputs, outputs, or side effects                |
| `FEATURE_SPEC.md`      | User-facing behavior, one entry per feature — what it does, not how                                                   | You add/remove a feature or change behavior a user (or test) can observe                                                |

## Before coding: consult

1. Read the spec(s) covering the area you're about to change. They are the fastest
   map of intended behavior and boundaries — cheaper than reconstructing from source.
2. If a spec contradicts the code, **the code is right**. Fix the spec (a surgical
   correction, separate from your feature work if the drift is unrelated) and mention
   the drift in your summary.

## After coding: update

1. Run the trigger table above against your diff. A change can hit more than one
   spec (a new endpoint that powers a new feature touches both `API_SPEC` and
   `FEATURE_SPEC`).
2. Edit only the entries your change affects — same surgical-diff rules as code.
3. Write what **is**, never what is planned. No "will", no roadmap items, no
   speculative sections. A removed feature's entry is deleted, not struck through.
4. Describe behavior and contracts, not implementation detail. Name the file and the
   schema/test that pins it; don't restate code line by line — duplicated detail is
   the next drift.

## What does NOT belong in the specs

Skip the update (avoid churn) when the change is:

- an internal refactor that moves code without changing boundaries or behavior
- styling, copy tweaks that don't change what a feature does, formatting
- test-only or tooling-only changes (unless they change the pipeline itself)

## Before declaring done

For each spec you touched — and each one the trigger table says you should have —
reread the affected entries against the final diff. The check: someone reading only
the spec would correctly predict what the code does. If any spec claim is now false,
you are not done.

## Periodic drift audit (on request)

When asked whether the docs are accurate: for each claim in each spec, verify it
against the code (routes on disk, workspace list, rendered behavior/tests). Fix
false claims, add missing entries, and report what drifted — don't just say "looks
fine".
