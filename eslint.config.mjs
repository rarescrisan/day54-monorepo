import { defineConfig, globalIgnores } from "eslint/config";

import { nextJsConfig } from "@repo/eslint-config/next-js";
import { config as reactInternalConfig } from "@repo/eslint-config/react-internal";

/**
 * Root ESLint config — a thin router, not a second source of rules.
 *
 * Every rule lives in `packages/eslint-config`; this file only says which shared
 * config applies to which path. It exists because ESLint 9 resolves flat config
 * from the CWD, so running `eslint` from the repo root (what lint-staged and
 * most editors do) finds no config at all without it — and lint-staged then
 * reports a spawn failure instead of your lint error.
 *
 * `pnpm run lint` still runs each package's own script; that is what CI gates
 * on. Both entry points compose the same shared configs, so they agree.
 */
export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "**/coverage/**",
    "**/playwright-report/**",
    "**/test-results/**",
    ".husky/_/**",
    "apps/web/next-env.d.ts",
  ]),
  {
    files: ["apps/*/**/*.{ts,tsx}"],
    extends: [nextJsConfig],
    // From the repo root the Next plugin would look for `pages/` here and warn
    // on every run. Point it at the apps instead.
    settings: { next: { rootDir: "apps/*/" } },
  },
  {
    files: ["packages/*/**/*.{ts,tsx}"],
    extends: [reactInternalConfig],
  },
]);
