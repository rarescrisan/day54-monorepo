---
name: complete-the-wiring
description: Use whenever adding a NEW named thing to a codebase — a config key, env var, module, entity/model, migration, route, enum value, feature flag, event type, or dependency. These almost always require registration in multiple places beyond the file you create; this skill is the procedure for finding every wiring point so nothing is silently undefined at runtime.
---

# Complete the Wiring

The classic weak-model failure when adding something new: create the file, wire the one place the compiler complains about, and stop. But most codebases register named things in places the compiler never checks — deployment manifests, config templates, provider arrays, docs, CI. The result works locally and returns `undefined` in production. **A new thing isn't added until every registration point is updated.**

## The procedure: find a sibling, diff its footprint

Never enumerate registration points from memory. Derive them empirically:

1. **Pick the most recently added sibling** — the last config key, the last module, the last entity of the same kind.
2. **Grep the entire repo for its name** (and its casing variants: `MY_KEY`, `myKey`, `my-key`, `my_key`).
3. **Every place the sibling appears is a place your new thing probably needs to appear.** Work the list explicitly — don't stop at the first few.
4. Better: if the sibling was added in a single commit, `git log -S 'siblingName' --oneline` and read that commit's full file list. That commit **is** the checklist.

## Common wiring points by kind

Use these as prompts for the grep, not as a substitute for it:

- **Config key / env var**: the typed config interface, the enum/constant of key names, the parsing/mapping helper, **every** deployment manifest or blueprint per app/environment, the local template (`local.json`, `.env.example`), docs. Missing a deployment manifest = `undefined` only in deployed environments — the worst kind of bug.
- **Module**: the parent app's module imports, DI providers/exports, route or schema registration (e.g. a GraphQL `include:` list), test bootstrap if it enumerates modules.
- **Entity / model**: the providers/registry file, the migration that creates its table, seed/fixture helpers used by tests.
- **Enum value / event type / flag**: every `switch`/mapping over the enum (search for uses of any existing value), serialization contracts, downstream consumers, constants files the repo says to add to.
- **Dependency**: the right `package.json` (root vs sub-package), the lockfile via a real install command (never hand-edit), license/audit configs if present.

## Verification

- After wiring, grep for **your new name** the same way you grepped the sibling's. Its footprint should match the sibling's, location for location. Any location where the sibling appears and yours doesn't needs a one-sentence justification.
- Compiles-and-tests-pass is **not** sufficient here: deployment manifests, templates, and docs aren't compiled. The sibling-footprint diff is the real check.
- In your summary, state where you registered the thing, so a reviewer can spot a missed location.

## Hard rules

- Never add a named thing in fewer places than its most recent sibling occupies — without explaining the difference.
- Never hand-edit lockfiles or generated registries; run the generator/installer.
- If the repo documents a wiring checklist for this kind of thing (CLAUDE.md, CONTRIBUTING, module README), follow it **and** still do the sibling grep — docs go stale; the sibling is ground truth.
