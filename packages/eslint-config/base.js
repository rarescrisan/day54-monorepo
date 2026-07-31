import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import turboPlugin from "eslint-plugin-turbo";
import importPlugin from "eslint-plugin-import-x";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import tseslint from "typescript-eslint";

/**
 * A shared ESLint configuration for the repository.
 *
 * `eslint-config-prettier` is last in the chain on purpose: it switches off every
 * stylistic rule that would otherwise fight Prettier. Do not add rules after it
 * that Prettier also controls.
 *
 * @type {import("eslint").Linter.Config[]}
 * */
export const config = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      turbo: turboPlugin,
      // Registered as `import` so the rule reads `import/no-cycle`. import-x is
      // the flat-config-native fork; the rule set and names are the same.
      import: importPlugin,
    },
    settings: {
      // All three of these are load-bearing for `import/no-cycle`, and each fails
      // *silently* when missing — the rule reports nothing and lint stays green:
      //   - resolver-next: without it, no import path resolves at all
      //   - parsers:       no-cycle re-parses the *imported* files to walk their
      //                    imports, and needs to be told what reads TypeScript
      //   - extensions:    so `./foo` is tried as `./foo.ts` / `./foo.tsx`
      // If you touch this block, re-prove the rule with a deliberate two-file cycle.
      "import-x/resolver-next": [
        createTypeScriptImportResolver({ alwaysTryTypes: true }),
      ],
      "import-x/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx", ".cts", ".mts"],
      },
      "import-x/extensions": [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
      "import-x/external-module-folders": [
        "node_modules",
        "node_modules/@types",
      ],
    },
    rules: {
      "turbo/no-undeclared-env-vars": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "import/no-cycle": "error",
      "no-console": "error",
    },
  },
  {
    // Tooling files are allowed to talk to the terminal — that is their output.
    files: ["**/*.config.{js,mjs,ts}", "**/scripts/**", "**/e2e/**"],
    rules: {
      "no-console": ["error", { allow: ["log", "warn", "error"] }],
    },
  },
  {
    ignores: ["dist/**", "coverage/**"],
  },
  eslintConfigPrettier,
];
