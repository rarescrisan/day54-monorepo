# Architecture Spec

Describes how the system is structured **today**. If this file and the code disagree,
the code is right — fix this file.

## System shape

A Turborepo monorepo using pnpm workspaces.

| Workspace                 | Path                         | Role                                                           |
| ------------------------- | ---------------------------- | -------------------------------------------------------------- |
| `web`                     | `apps/web`                   | Next.js (App Router) app — the user-facing deployable          |
| `api`                     | `apps/api`                   | NestJS service; `tsc` to `dist/`, run as `node dist/main.js`   |
| `@repo/ui`                | `packages/ui`                | Shared React components (`button.tsx`, `card.tsx`)             |
| `@repo/eslint-config`     | `packages/eslint-config`     | Shared ESLint flat configs (`base`, `next`, `react-internal`)  |
| `@repo/typescript-config` | `packages/typescript-config` | Shared tsconfigs (`base`, `nextjs`, `nestjs`, `react-library`) |

The two apps are independent deployables and do not import each other. Nothing
in `apps/web` calls `apps/api` — the browser has no dependency on the service.

## Boundaries and dependency direction

- `apps/*` may import `packages/*`; `packages/*` never import an app and never
  import each other's internals via relative paths — always the workspace name.
- `import/no-cycle` is enforced as an ESLint error (see `packages/eslint-config/base.js`).

## Server/client boundary

- Pages and layouts are Server Components by default.
- `"use client"` only on interactive leaves. Reference:
  `apps/web/src/components/counter.tsx` (client) rendered by
  `apps/web/src/app/page.tsx` (server).

## Data and persistence

No database. One external service: the `GET /api/pokemon` route handler in
`apps/web` proxies PokeAPI. Its upstream and sprite base URLs are module
constants in `apps/web/src/app/api/pokemon/route.ts`, not env vars — they are
neither secret nor environment-dependent. The only environment-dependent
config is `PORT` (read by `apps/api`, defaulting to 3001) — declared in
`turbo.json`'s `globalEnv` so the ESLint rule against undeclared env vars
passes.

## Build and test pipeline

- Turborepo tasks: `build`, `lint`, `typecheck`, `test`,
  `e2e` (Playwright, builds and starts the app itself).
- `test` is Vitest everywhere: Testing Library in `apps/web` and `packages/ui`,
  supertest against a bootstrapped Nest app in `apps/api`.
- `apps/api` compiles with `tsc`, not the Nest CLI. Path-valued compiler
  options (`outDir`) live in `apps/api/tsconfig.json`, never in the shared
  config — tsconfig resolves relative paths against the file that declares
  them, so an `outDir` in `@repo/typescript-config` emits into that package.
- Dependency versions pinned exactly; installs governed by
  `pnpm-workspace.yaml` (`minimumReleaseAge`, blocked install scripts).
