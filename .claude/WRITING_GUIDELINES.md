# Writing guidelines

Repo-specific code rules. This file describes only what the repo actually practices
today — when a new convention settles, add it here; don't add rules ahead of the code.

## Layout

- `apps/` holds deployables: `apps/web` (Next.js) and `apps/api` (NestJS).
  `packages/` holds shared code. The two apps never import each other.
- Shared code is consumed by its workspace name (`@repo/ui`, `@repo/eslint-config`,
  `@repo/typescript-config`). Never reach across a package boundary with a relative
  path (`../../packages/ui/src/button`).
- Dependencies point one way: `apps/*` may import `packages/*`; `packages/*` never
  imports an app. `import/no-cycle` is an ESLint error and is proven to fire — see the
  comment block in `packages/eslint-config/base.js` before touching those settings.

## Server vs. client

- Default to Server Components. Add `"use client"` only when the component needs
  state, effects, refs, or browser APIs. `apps/web/src/components/counter.tsx` is the
  reference for the boundary: the page stays a Server Component, the interactive leaf
  does not.
- Anything named `NEXT_PUBLIC_*` is shipped to the browser. Never a key, token,
  secret, or database URL.
- A module that reads data or holds credentials starts with `import 'server-only'`, so
  importing it from a client component is a build error rather than a leak.
- Use JSX `{value}` interpolation, which escapes. Never `dangerouslySetInnerHTML` with
  anything a user supplied.

## Components

- Function components, named exports, one component per file.
- Explicit return type on every exported function (`: JSX.Element`).
- Props as an exported `interface`, extending the underlying DOM element's props when
  the component wraps one — callers keep the native escape hatches.
- Colocate tests as `*.test.tsx` next to the component.
- **Canonical reference component: `packages/ui/src/button.tsx`.** When in doubt, copy
  its shape.

## Naming

- `PascalCase` — components, types, interfaces.
- `lowerCamelCase` — functions, variables, props.
- `kebab-case` — file names, including component files (`button.tsx`, `counter.tsx`).
- `UPPER_SNAKE_CASE` — exported constants and env var names.

## TypeScript

- `strict: true` everywhere; `any` is an ESLint error, not a warning. If a type is
  genuinely unknown, use `unknown` and narrow it.
- tsconfigs extend `@repo/typescript-config`. `packages/*` resolve as
  `moduleResolution: Bundler` because they ship `.tsx` source that Next and Vite
  bundle — they are never executed by node directly. `apps/api` keeps
  `NodeNext` and is emitted as CommonJS.
- **Path-valued compiler options (`outDir`, `rootDir`, `paths`) belong in the
  consuming tsconfig, never in the shared one.** tsconfig resolves relative
  paths against the file that declares them, so an `outDir` in
  `@repo/typescript-config` silently emits into that package instead of the app.

## Testing

- Test through the rendered surface. Query by role and accessible name
  (`getByRole("button", { name: "Increment" })`); reach for `data-testid` only when
  there is genuinely no accessible handle.
- Vitest + Testing Library for components (`pnpm run test`), Playwright for flows
  (`pnpm run e2e`). Playwright builds and starts the app itself.
- Never mock your own modules. Mock at the network boundary only — MSW for component
  tests, `page.route` interception for Playwright.
- Testing Library cleanup is registered explicitly in each `vitest.setup.ts`; Vitest
  runs with `globals` off, so auto-cleanup does not self-register.

## Dependencies

- Every version is pinned exactly. No `^`, no `~`, anywhere, ever. `.npmrc` sets
  `save-exact=true` so plain `pnpm add` complies.
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 10080` — a package version published
  in the last 7 days will not install. Pin an older version rather than adding a
  `minimumReleaseAgeExclude` entry.
- Install scripts are blocked by default; `allowBuilds` lists the exceptions.
- Before adding a dependency: check whether the repo already solves it, then ask.

## Secrets

- `ASANA_TOKEN` and `ANTHROPIC_API_KEY` are read from the environment. They are never
  written to a file in this repo, never passed on a command line that lands in shell
  history, and never echoed into CI logs. In CI they are GitHub Actions secrets.
