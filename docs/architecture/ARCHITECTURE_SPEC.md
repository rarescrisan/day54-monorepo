# Architecture Spec

Describes how the system is structured **today**. If this file and the code disagree,
the code is right — fix this file.

## System shape

A Turborepo monorepo using pnpm workspaces.

| Workspace                 | Path                         | Role                                                          |
| ------------------------- | ---------------------------- | ------------------------------------------------------------- |
| `web`                     | `apps/web`                   | Next.js (App Router) app — the only deployable                |
| `@repo/ui`                | `packages/ui`                | Shared React components (`button.tsx`, `card.tsx`)            |
| `@repo/eslint-config`     | `packages/eslint-config`     | Shared ESLint flat configs (`base`, `next`, `react-internal`) |
| `@repo/typescript-config` | `packages/typescript-config` | Shared tsconfigs (`base`, `nextjs`, `react-library`)          |

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

None yet. No database, no external services, no environment-dependent config.

## Build and test pipeline

- Turborepo tasks: `build`, `lint`, `typecheck`, `test` (Vitest + Testing Library),
  `e2e` (Playwright, builds and starts the app itself).
- Dependency versions pinned exactly; installs governed by
  `pnpm-workspace.yaml` (`minimumReleaseAge`, blocked install scripts).
