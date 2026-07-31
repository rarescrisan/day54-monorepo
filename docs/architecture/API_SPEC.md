# API Spec

Describes every HTTP-reachable surface of `apps/web`: route handlers
(`app/**/route.ts`), Server Actions, and any middleware that shapes requests.
If this file and the code disagree, the code is right — fix this file.

## Current surface

`apps/web` has no route handlers, no Server Actions and no middleware — it
serves only statically rendered pages. The HTTP surface below belongs to
`apps/api` (NestJS, port 3001 by default, overridable with `PORT`).

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
