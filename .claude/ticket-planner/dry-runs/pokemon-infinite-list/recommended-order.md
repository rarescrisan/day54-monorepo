# Recommended build order — Pokémon infinite list

Status legend: ✅ done · ▶️ ready · ⏳ blocked

The chain is fully serial: each wave pins the contract the next wave consumes.
Sub-tasks within a story are listed in the order they naturally build. Points
ladder up: sub-tasks sum to their story, stories (7 + 8 + 4 = 19) to the epic.

## Wave 1 — the server seam

- ▶️ **WEB-POKE-1** `[API]` Pokémon proxy route handler with in-memory cache (7 pts)
  — no dependencies. Everything else builds against the response shape and
  error contract this ticket pins with tests.
  1. ✅ WEB-POKE-1.1 — add `zod` + `msw`, pinned exactly (1 pt)
  2. ✅ WEB-POKE-1.2 — `pokemonQuerySchema` + `PokemonPage` types (1 pt)
  3. ✅ WEB-POKE-1.3 — GET handler: proxy, reshape, 400/502 paths (2 pts)
  4. WEB-POKE-1.4 — module-level `Map` cache (1 pt)
  5. WEB-POKE-1.5 — `route.test.ts` with MSW node server (2 pts)

## Wave 2 — the client

- ⏳ **WEB-POKE-2** `[FE]` /pokemon page with infinite-scrolling list (8 pts)
  — blocked by WEB-POKE-1 (consumes `GET /api/pokemon`).
  1. WEB-POKE-2.1 — `/pokemon` page shell (Server Component) (1 pt)
  2. WEB-POKE-2.2 — `PokemonList`: first page render (2 pts)
  3. WEB-POKE-2.3 — IntersectionObserver sentinel and append (2 pts)
  4. WEB-POKE-2.4 — loading announcement, error state, Retry (1 pt)
  5. WEB-POKE-2.5 — `pokemon-list.test.tsx` (Testing Library + MSW) (2 pts)

## Wave 3 — proof and paperwork

- ⏳ **WEB-POKE-3** `[QA]` Pokémon e2e flow and architecture spec updates (4 pts)
  — blocked by WEB-POKE-1 and WEB-POKE-2 (drives the full rendered flow, and
  the spec entries describe behavior that must exist first).
  1. WEB-POKE-3.1 — Playwright e2e: `pokemon.spec.ts` (2 pts)
  2. WEB-POKE-3.2 — `API_SPEC.md`: `GET /api/pokemon` entry (1 pt)
  3. WEB-POKE-3.3 — `FEATURE_SPEC` and `ARCHITECTURE_SPEC` updates (1 pt)
