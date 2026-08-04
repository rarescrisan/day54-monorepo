# RFC 0001 — Pokémon infinite list with a caching proxy

- **Status:** Draft
- **Author:** rares.crisan@novo.co
- **Date:** 2026-08-03
- **Scope:** `apps/web` only

## Summary

Add a `/pokemon` page to `apps/web` that renders an infinite-scrolling list of
Pokémon. The browser never talks to [PokeAPI](https://pokeapi.co) directly:
it calls a route handler in the same Next.js app
(`GET /api/pokemon?offset=N&limit=M`), which proxies the request to PokeAPI and
memoizes responses in an in-memory cache.

This is deliberately a small, end-to-end exercise of the repo's conventions:
the first route handler, the first external service call, the first
client-side data fetch, and the first spec updates driven by a real feature.

## Motivation

The skeleton currently demonstrates the server/client boundary with a counter
and nothing else. It has no route handlers, no external I/O, and no example of
the fetch → validate → cache → render pipeline that almost every real feature
needs. A tiny read-only feature against a free public API gives us:

- a canonical route-handler example to copy (the way `counter.tsx` is the
  canonical client-component example),
- a worked example of mocking at the network boundary (MSW / `page.route`)
  rather than mocking our own modules,
- a forcing function to exercise `/maintain-architecture-docs`,
  `/complete-the-wiring`, and the ticket-planner flow on a real change.

## Design

### Where the proxy lives: `apps/web`, not `apps/api`

`ARCHITECTURE_SPEC.md` is explicit: the two apps are independent deployables
and **nothing in `apps/web` calls `apps/api`**. Putting the proxy in the NestJS
service would break that boundary, introduce CORS, and couple the page to a
second deployable for no benefit. The proxy is therefore a Next.js route
handler:

```
apps/web/src/app/api/pokemon/route.ts
```

This is the first entry in `apps/web`'s HTTP surface, so `API_SPEC.md`'s
"no route handlers" paragraph gets replaced as part of the implementation.

### `GET /api/pokemon`

- **Handler:** `apps/web/src/app/api/pokemon/route.ts`
- **Auth:** none. The endpoint is a read-only proxy for public data, holds no
  credentials, and the app is not deployed. If this repo ever gains a real
  deployment, the route falls under the firm's deployment rules (Cloudflare
  Access JWT verification) like every other route — flagged here so the gap is
  a documented decision, not an oversight.
- **Request:** query params validated with Zod (`pokemonQuerySchema`):
  - `offset` — integer ≥ 0, default `0`
  - `limit` — integer 1–50, default `20`

  Invalid input → `400` with `{ error: string }`. Validation failures never
  reach PokeAPI.

- **Upstream:** `https://pokeapi.co/api/v2/pokemon?offset=&limit=`. The base
  URL is a module constant, not an env var — it is not a secret and not
  environment-dependent, and a constant avoids touching `turbo.json`'s
  `globalEnv` allowlist. Tests substitute the upstream at the network boundary
  (MSW), so no config seam is needed.
- **Response:** `200` with

  ```ts
  interface PokemonPage {
    items: Array<{ id: number; name: string; spriteUrl: string }>;
    nextOffset: number | null; // null when the last page has been served
  }
  ```

  PokeAPI's list endpoint returns only `{ name, url }` per Pokémon. The
  handler derives `id` from the trailing segment of `url` and builds
  `spriteUrl` from the official sprites CDN pattern
  (`…/sprites/pokemon/<id>.png`). This is the one place the proxy is more than
  a pass-through — see _Alternatives_ for why.

  Upstream failure (non-2xx, network error, timeout) → `502` with
  `{ error: string }`. The handler never caches failures.

- **Side effects:** populates the in-memory cache (below). Nothing else.

### In-memory cache

A module-level `Map<string, PokemonPage>` in the route handler's module, keyed
by `"${offset}:${limit}"`.

- **No TTL, no eviction.** The Pokémon roster is effectively static (~1,300
  entries ⇒ ~65 pages at the default limit), so the map is naturally bounded
  and staleness is a non-issue for the lifetime of a dev-server process. A TTL
  would be speculative code guarding a scenario this app doesn't have.
- **Known limits, accepted:** the cache is per-process (empty after every
  restart, not shared across serverless instances or between `next dev`
  workers). That is the point of the exercise — an _in-memory_ cache with its
  real trade-offs, documented rather than hidden.
- Only `200` responses from PokeAPI are cached.

### Client: `/pokemon` page

```
apps/web/src/app/pokemon/page.tsx        # Server Component — heading + shell
apps/web/src/components/pokemon-list.tsx # "use client" — the interactive leaf
```

Same split as the existing `page.tsx` / `counter.tsx` reference pair: the page
stays a Server Component; only the list is a client component.

`PokemonList` behavior:

1. On mount, fetch `/api/pokemon` (offset 0) and render the items — name and
   sprite per row, each row a list item with an accessible name.
2. A sentinel element sits after the last row, watched by an
   `IntersectionObserver`. When it enters the viewport and `nextOffset` is not
   `null` and no request is in flight, fetch the next page and append.
3. While a page is loading, render a "Loading more…" status with
   `aria-live="polite"` (same announcement pattern as the counter).
4. On fetch failure, stop auto-loading and render the error with a **Retry**
   button; retry re-requests the failed offset.
5. When `nextOffset` is `null`, unobserve the sentinel and render an
   end-of-list message.

State is plain `useState`/`useRef` — accumulated items, `nextOffset`, an
in-flight flag, and an error. No data-fetching library (see _Alternatives_).

New UI needed for a list row stays local to `apps/web` unless a second
consumer appears; `packages/ui` gains nothing from this RFC.

## Testing

Per the repo's testing rules — through the rendered surface, mock only at the
network boundary:

- **Route handler** (`route.test.ts`, Vitest + MSW node server): valid request
  proxies and reshapes correctly; second identical request is served without a
  second upstream hit (assert MSW request count); invalid `offset`/`limit` →
  `400` without an upstream call; upstream `500` → `502` and a retry can
  succeed (failure not cached).
- **`PokemonList`** (`pokemon-list.test.tsx`, Vitest + Testing Library + MSW,
  `IntersectionObserver` stubbed — jsdom has none): first page renders by
  accessible name; intersection triggers exactly one append; error path shows
  the retry button and retry recovers; end of list stops fetching.
- **E2E** (`apps/web/e2e/pokemon.spec.ts`, Playwright with `page.route`
  intercepting `/api/pokemon` — the test must not depend on pokeapi.co being
  up): scroll to bottom loads a second page; the page heading and rows are
  reachable by accessible name.

## Spec updates (same change, per `/maintain-architecture-docs`)

- `API_SPEC.md` — replace the "no route handlers" paragraph with a
  `GET /api/pokemon` entry in the documented template.
- `FEATURE_SPEC.md` — add a "Pokémon list" entry (route, behavior, tests).
- `ARCHITECTURE_SPEC.md` — "Data and persistence" currently says _no external
  services_; amend to name PokeAPI as an outbound dependency of `apps/web` and
  describe the per-process cache.

## Alternatives considered

- **Proxy in `apps/api` (NestJS).** Rejected: violates the standing "web never
  calls api" boundary, adds CORS and a second process to every dev loop, and
  the proxy has no need for Nest's machinery.
- **Pure pass-through proxy (forward PokeAPI's JSON verbatim).** Rejected,
  narrowly: PokeAPI's list shape (`{ name, url }` plus absolute `next`/
  `previous` URLs) would push URL parsing into the client and leak upstream
  URL structure into our contract. The thin reshape keeps the client dumb and
  gives the cache a stable value type. This is the closest call in the RFC —
  if reviewers prefer a literal proxy, nothing else in the design changes.
- **Next.js built-in data cache (`fetch` with `revalidate`) instead of a
  hand-rolled Map.** Genuinely idiomatic, but it hides the cache inside
  framework behavior that differs between dev and prod. The explicit `Map`
  is the exercise: visible, testable (assertable via upstream request
  counts), and honest about its limits.
- **TanStack Query / SWR on the client.** Rejected: one infinite list does not
  justify a new pinned dependency; `useState` + `IntersectionObserver` covers
  it. Revisit if a second data-fetching surface appears.

## Non-goals

- Search, filtering, or Pokémon detail pages.
- Persistence, shared/distributed caching, or cache invalidation.
- Rate-limit handling beyond surfacing an error (PokeAPI is unauthenticated
  and generous; the cache already minimizes calls).
- Auth on the route (documented above as a deliberate local-only decision).

## Open questions

1. Page size: is `limit=20` per fetch the right default for the demo, or
   should the e2e use a smaller page to keep fixtures tiny? (Proposal: keep 20
   in code, use `limit` override in tests.)
2. Should the sprite images use `next/image` (needs `images.remotePatterns`
   config for the sprites CDN) or a plain `<img>`? (Proposal: plain `<img>`
   with width/height set — one less config wiring point for a demo.)

## Implementation plan

Suitable for `/plan-tickets` as three tickets, in dependency order:

1. Route handler + Zod schema + cache + handler tests.
2. `/pokemon` page + `PokemonList` + component tests.
3. Playwright e2e + the three spec updates.
