---
name: explore-before-coding
description: Use before writing or editing ANY code in a codebase — new feature, bug fix, refactor, or test. Forces reconnaissance first, finding the canonical example to copy, and verifying that every API you plan to call actually exists. Skip only for pure questions that involve no code changes.
---

# Explore Before Coding

The single biggest gap between strong and weak coding models is not code generation — it is what they do **before** generating code. Weak models pattern-match from training data and produce plausible-looking code that doesn't fit the repo: wrong import paths, invented helper functions, a second way of doing something the repo already does one way. Strong models spend the first minutes reading, and their first draft lands.

## Procedure

### 1. Find the canonical example

Almost every task in an established repo has already been done once, nearby. Before writing anything:

- **Adding a module/endpoint/command?** Find the most recently added one of the same kind and open every file in it. That is your template — copy its shape, folder layout, naming, and registration steps exactly.
- **Fixing a bug?** Find where the behavior lives by following the data, not by guessing filenames. Search for a user-visible string, an error message, a route path, an event name.
- **Adding a test?** Open 2–3 existing tests for similar functionality first. Copy their setup, fixtures, and assertion style.

Check whether the repo's docs (`CLAUDE.md`, `README`, `CONTRIBUTING`, `docs/`) name a reference implementation. Many repos designate one module as the pattern to copy — use it.

### 2. Read the actual code you will touch

- Read every file you plan to edit **in full context around the edit site**, not just the matching lines from a search.
- Read the callers and callees of any function you change. A signature change has a blast radius — know it before you edit.
- Read the imports at the top of the file. They tell you which utilities, loggers, and error types this codebase actually uses.

### 3. Verify every API before you call it

Weak models hallucinate. Counter it mechanically:

- Before calling a function/method you haven't seen in this session, **open its definition** (or grep for it). Confirm the name, parameters, and return type.
- Before importing from a package, check `package.json` (or the equivalent manifest) that the package exists and note its major version — APIs differ across versions.
- Before using a config value, env var, or constant, find where it is defined and how existing code reads it.

If you cannot find it, it probably doesn't exist. Do not invent it — find the repo's real way of doing that thing.

### 4. Mirror, don't introduce

- Match the file's existing style: naming, error handling, logging, comment density — even if you'd personally do it differently.
- Never introduce a new library, framework, or pattern that isn't already in the repo without asking first. The question to ask yourself: "does an existing dependency or in-repo helper already do this?" It almost always does.
- If the repo does something one way in 10 places and a "better" way in 1 place, use the 10-places way.

## Hard rules

| Never | Instead |
|---|---|
| Edit a file you haven't read | Read it first, in full or with generous context |
| Call a function you haven't seen defined | Open the definition and confirm the signature |
| Guess an import path | Grep for how other files import the same thing |
| Add a dependency to solve a problem | Search the repo for the existing solution first |
| Create a new pattern alongside an existing one | Copy the existing pattern, even if imperfect |

## Checklist before your first edit

- [ ] I found and read a canonical example of what I'm building
- [ ] I read every file I'm about to edit
- [ ] Every function/API in my planned change exists and I've seen its signature
- [ ] My change uses only patterns and dependencies already in the repo
