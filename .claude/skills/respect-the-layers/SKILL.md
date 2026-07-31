---
name: respect-the-layers
description: Use when adding or modifying code in a layered backend service (controllers/resolvers, services, repositories/data access, models) or any codebase with defined module boundaries. Covers which layer code belongs in, one-way dependency flow, and what to do when the "quick" path wants to skip a layer.
---

# Respect the Layers

Layered codebases stay maintainable only if every piece of code lives in its designated layer. Weak models erode this: a query sneaks into a controller "because it's just one line," business logic lands in a route handler, a data model grows behavior. Each violation is small; collectively they make the codebase untestable and unrefactorable. **Where code goes is not a style choice — it's the architecture.**

## The standard shape

Most backend services follow some version of:

```
Transport layer     (controllers, resolvers, route handlers, CLI commands, message consumers)
      ↓
Business layer      (services, use-cases, domain logic)
      ↓
Data-access layer   (repositories, DAOs, query builders)
      ↓
Model layer         (entities, schemas, table definitions)
```

Dependencies point **down only**. Each layer knows the one below it and nothing about the one above.

## Responsibilities per layer

- **Transport**: parse/validate input, call one service method, shape the response, map errors to protocol codes. **No business logic, no data access.** If a handler contains an `if` about domain rules or a query, it's in the wrong layer.
- **Business**: all domain decisions live here. Talks to repositories, other services, and external clients. **Doesn't know the transport** — no request/response objects, no protocol status codes, no transport-specific types in its signatures. Throws domain errors; the transport layer translates them.
- **Data access**: the **only** layer that touches the ORM, query builder, or driver. One repository per aggregate/table, exposing intent-named methods (`findActiveByUserId`), not generic query passthroughs.
- **Models**: shape only — fields, types, relations. No business behavior on model classes.

## Rules that prevent erosion

1. **Skipping a layer means something is missing.** If a controller "just needs one quick query," the missing piece is a service method. Create it — don't reach around.
2. **Boundary types.** What crosses a layer boundary is a plain domain object/DTO, not the layer's internal type. Don't return ORM entities to the transport layer; don't accept framework request objects in services.
3. **Cross-module access goes through the front door.** Module A uses module B's public service interface — never B's repository, internals, or tables directly.
4. **Circular imports mean a boundary is wrong.** If two modules need each other, extract the shared piece downward or merge them. Never "fix" a cycle with a lazy/deferred import.
5. **Follow the repo's dependency mechanism.** If the codebase uses dependency injection, register through the container — don't instantiate services with `new` or create singletons on the side.
6. **Shared code goes in the designated shared place.** Most repos separate app code, internal shared code, and externally-published packages. Check where existing shared helpers live before creating a new location; never deep-import across those boundaries when an alias or package install path exists.

## Before adding code, ask

1. Which layer does this behavior belong to? (Decision → business. Query → data access. Input/output shaping → transport.)
2. Where does the repo put this kind of code today? Find one existing example and put yours in the same kind of place.
3. Does my import direction point downward only? If I'm importing "upward" or sideways into another module's internals, stop.

## Hard rules

| Violation | Correct move |
|---|---|
| Query/ORM call in a controller or resolver | Add a service method that calls a repository |
| Business rule (`if user.plan == ...`) in a route handler | Move the rule into the service |
| Service returns ORM entities across its boundary | Map to a plain DTO at the service edge |
| Module A imports module B's repository | Call B's public service instead |
| "Temporary" layer skip to save time | There are no temporary skips; they never get removed |
