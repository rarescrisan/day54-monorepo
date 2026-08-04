# API Spec

Describes every HTTP-reachable surface of `apps/web`: route handlers
(`app/**/route.ts`), Server Actions, and any middleware that shapes requests.
If this file and the code disagree, the code is right — fix this file.

## Current surface

`apps/web` has one route handler, no Server Actions and no middleware — every
other route is a statically rendered page. `GET /health` below belongs to
`apps/api` (NestJS, port 3001 by default, overridable with `PORT`).

### `GET /api/pokemon`

- **Handler:** `apps/web/src/app/api/pokemon/route.ts`
- **Auth:** none — an unauthenticated read-only proxy
- **Request:** query parameters validated by `pokemonQuerySchema`, yielding an
  `offset` and a `limit`
- **Response:** `200` with
  `{ items: [{ id, name, spriteUrl }], nextOffset }`, where `id` is taken from
  the trailing segment of the upstream item URL, `spriteUrl` points at the
  PokeAPI sprites repository, and `nextOffset` is `offset + limit` or `null`
  when upstream reports no next page. `400` with `{ error }` when the query
  parameters fail validation — upstream is not called. `502` with `{ error }`
  when upstream answers non-2xx, the request fails, or the body is not JSON
- **Side effects:** none of its own; issues one outbound request to PokeAPI

### `GET /health`

- **Handler:** `apps/api/src/health/health.controller.ts`
- **Auth:** none — an unauthenticated liveness probe
- **Request:** no parameters, no body
- **Response:** `200` with
  `{ status: "ok", uptimeSeconds: number, timestamp: string }`, where
  `uptimeSeconds` is a whole number of seconds since process start and
  `timestamp` is ISO 8601. There is no failure response: if the process
  cannot serve, the request does not get answered
- **Side effects:** none

Deliberately dependency-free — a liveness probe that can fail because one of
its own collaborators failed to construct is not a liveness probe. Checks that
depend on a database or queue belong on a separate readiness endpoint.
Pinned by `apps/api/src/health/health.controller.test.ts`, which drives it
through a bootstrapped `AppModule` rather than the controller class.

## How to document an endpoint (template)

When the first endpoint lands, replace the section above with entries in this shape:

### `METHOD /path`

- **Handler:** `apps/web/src/app/<path>/route.ts`
- **Auth:** who may call it, and how that is enforced
- **Request:** parameters / body shape (name the Zod schema, don't restate it)
- **Response:** success shape and status; error statuses and when they occur
- **Side effects:** what it writes, sends, or triggers
