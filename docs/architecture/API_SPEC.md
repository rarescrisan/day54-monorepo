# API Spec

Describes every HTTP-reachable surface of `apps/web`: route handlers
(`app/**/route.ts`), Server Actions, and any middleware that shapes requests.
If this file and the code disagree, the code is right — fix this file.

## Current surface

**None.** The app has no API routes, no Server Actions, and no middleware.
It serves only statically rendered pages.

## How to document an endpoint (template)

When the first endpoint lands, replace the section above with entries in this shape:

### `METHOD /path`

- **Handler:** `apps/web/src/app/<path>/route.ts`
- **Auth:** who may call it, and how that is enforced
- **Request:** parameters / body shape (name the Zod schema, don't restate it)
- **Response:** success shape and status; error statuses and when they occur
- **Side effects:** what it writes, sends, or triggers
