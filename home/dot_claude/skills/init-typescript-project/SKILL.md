---
name: init-typescript-project
description: Initialize a new TypeScript project with proper guardrails
disable-model-invocation: true
---

# Initialize TypeScript Project

If the project type is not apparent from the conversation context, ask the user what kind of project they want to create (e.g., CLI tool, web app, API server, library, Cloudflare Workers, etc.) before proceeding.

## Steps

1. Run `bun init` to scaffold the project
2. Install dev dependencies:
   ```
   bun add -d @biomejs/biome eslint @eslint/js @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-eslint-comments eslint-plugin-functional eslint-plugin-unicorn husky knip
   ```
4. Create all config files listed below (adapt entry points and globals based on the project type)
5. Run `bunx husky init` then write the pre-commit hook
6. Add the scripts to `package.json`
7. Run `bun check` to verify everything works

## package.json scripts

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "knip": "knip",
    "check": "bun format:check && bun typecheck && bun lint && bun knip",
    "prepare": "husky"
  }
}
```

## biome.json

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.8/schema.json",
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineEnding": "lf",
    "lineWidth": 100,
    "attributePosition": "auto"
  },
  "linter": {
    "enabled": false
  },
  "javascript": {
    "formatter": {
      "jsxQuoteStyle": "double",
      "quoteProperties": "asNeeded",
      "trailingCommas": "all",
      "semicolons": "always",
      "arrowParentheses": "always",
      "bracketSpacing": true,
      "bracketSameLine": false,
      "quoteStyle": "double",
      "attributePosition": "auto"
    }
  },
  "json": {
    "formatter": {
      "enabled": true,
      "indentStyle": "space",
      "indentWidth": 2,
      "lineEnding": "lf"
    }
  },
  "files": {
    "includes": ["**/*.{ts,tsx,js,jsx,json,jsonc}"],
    "ignoreUnknown": false
  }
}
```

## eslint.config.js

Adapt the `globals` and `files` sections based on the project type.

```javascript
import js from "@eslint/js";
import typescript from "@typescript-eslint/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import eslintComments from "eslint-plugin-eslint-comments";
import functional from "eslint-plugin-functional";
import unicorn from "eslint-plugin-unicorn";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        Bun: "readonly",
        AbortController: "readonly",
        performance: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": typescript,
      functional: functional,
      unicorn: unicorn,
      "eslint-comments": eslintComments,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "functional/no-throw-statements": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "error",
      "no-console": "error",
      "no-debugger": "error",
      "no-alert": "error",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      "no-unused-expressions": "error",
      "no-unused-vars": "off",
      "no-shadow": "off",
      "@typescript-eslint/no-shadow": "error",
      "no-fallthrough": "off",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "unicorn/prefer-switch": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSTypePredicate",
          message:
            "Type predicates are not allowed because of the unsoundness. Rethink your type design.",
        },
        {
          selector: 'BinaryExpression[operator="in"]',
          message:
            "The `in` operator is not allowed. Use sum types so that you won't need them in the first place.",
        },
      ],
      "eslint-comments/no-use": ["error", { allow: [] }],
    },
  },
  {
    ignores: ["node_modules/", "*.config.js", "dist/"],
  },
];
```

For projects with a CLI entry point or server entry point, add a block to allow `no-console` on those files.

## knip.json

Adapt `entry` and `project` based on the project type.

```json
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "ignoreExportsUsedInFile": true,
  "entry": ["src/index.ts"],
  "project": ["src/**/*.ts"],
  "eslint": {
    "config": ["eslint.config.js"]
  },
  "typescript": {
    "config": ["tsconfig.json"]
  },
  "biome": {
    "config": ["biome.json"]
  },
  "husky": {
    "config": [".husky/pre-commit"]
  }
}
```

## .husky/pre-commit

```bash
bun format && bun check
```

## Adaptations by project type

- **Web app / React**: Add `"jsx": "react-jsx"` to tsconfig, `"DOM"` to lib, add browser globals (window, document, fetch, Request, Response, Headers, URL, HTMLElement, Event, etc.) to eslint config, add `"*.tsx"` to eslint files glob
- **CLI tool**: Allow `no-console` on the CLI entry file
- **API server**: Allow `no-console` on the server entry file
- **Library**: Add `"declaration": true` to tsconfig, configure `outDir`
- **Cloudflare Workers**: Consider using oxlint + oxfmt instead of eslint + biome
