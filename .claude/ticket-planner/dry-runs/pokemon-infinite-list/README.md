# Pokémon infinite list — ticket plan

**Origin:** [RFC 0001 — Pokémon infinite list with a caching proxy](../../../../docs/rfcs/0001-pokemon-infinite-list.md)
(`docs/rfcs/0001-pokemon-infinite-list.md`, Draft, 2026-08-03). The plan follows the
RFC's own three-step implementation plan with no deviations.

**Board:** the [Pokedex project](https://app.asana.com/1/1217079558452780/project/1217137770260769/list)
(`1217137770260769`) — created for this initiative on 2026-08-03; the first
replay landed on "Client engagement" and the four tasks were moved. **History:**
the initial replay created only the epic + 3 stories; the 13 sub-tasks
(`WEB-POKE-N.M`) were appended the same day when the plan was deepened to
file-level sub-tasks (now the default granularity — see the plan-tickets skill).

## The decision that shaped the breakdown

The proxy is a **Next.js route handler in `apps/web`**, not an endpoint in
`apps/api` — the architecture spec forbids web → api calls, and a NestJS proxy
would add CORS plus a second process to every dev loop. That makes this a
single-workspace initiative (`apps/web` only), so the split is by pipeline
stage rather than by deployable:

1. **WEB-POKE-1** — the server seam (route handler, Zod validation, in-memory
   cache) with its contract pinned by tests, so the client work starts against
   a finished API.
2. **WEB-POKE-2** — the client (`/pokemon` page + `PokemonList`).
3. **WEB-POKE-3** — e2e proof plus the three `docs/architecture/` spec updates
   (this feature invalidates "no route handlers" / "no external services"
   claims in the specs, so docs are acceptance criteria, not an afterthought).

## Locked decisions (from the RFC)

- Response is a thin reshape (`{ id, name, spriteUrl }`, `nextOffset`), not a
  verbatim pass-through — flagged in the RFC as the closest call.
- Cache is a module-level `Map`, no TTL, no eviction; only 200s cached.
- No data-fetching library; no `next/image` (plain `<img>`).
- PokeAPI base URL is a module constant, not an env var.
- No auth: local-only app, public read-only data (documented in the RFC).

## Open questions (do not block replay)

- Default page size 20 vs. smaller fixtures in tests — RFC proposes keeping 20
  in code and overriding `limit` in tests.

## Notes for implementers

- `zod` and `msw` are **not yet dependencies** — WEB-POKE-1 adds them, pinned
  exactly; `minimumReleaseAge` (7 days) rejects too-recent versions.

## Files

| File                     | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `tickets-08032026.jsonl` | 1 epic + 3 stories + 13 sub-tasks — the editable source of record |
| `state-08032026.json`    | planner ID → Asana GID/permalink, filled by replay                |
| `recommended-order.md`   | dependency-aware build order                                      |
| `asana-map.md`           | planner ID ↔ permalink table                                      |

## Replay

```bash
node .claude/ticket-planner/replay.mjs \
  --input .claude/ticket-planner/dry-runs/pokemon-infinite-list/tickets-08032026.jsonl \
  --state .claude/ticket-planner/dry-runs/pokemon-infinite-list/state-08032026.json
```

## Forecast

**19 points** total, laddered bottom-up per the plan-tickets points convention:
each sub-task carries 1–3 points, stories are the exact sum of their sub-tasks
(7 + 8 + 4), and the epic is the sum of its stories. The original top-down
estimate was 8 (3 + 3 + 2); the bottom-up re-derivation on 2026-08-03 came out
higher, as sub-task-level sums usually do. Critical path: WEB-POKE-1 →
WEB-POKE-2 → WEB-POKE-3 — fully serial; no parallel work available in this
initiative.
