// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ["tsconfig.json", "tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The Apple bridges (JXA / ObjC bridge) are inherently dynamic; the
      // runtime boundaries are covered by the integration suites instead.
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      // server.tool() is the project-mandated MCP SDK registration API
      // (AGENTS.md "Hard constraints"); registerTool is not adopted.
      "@typescript-eslint/no-deprecated": "off",
      // Best-effort cleanup blocks (`try { ... } catch {}`) are deliberate.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowAny: true,
          allowNumber: true,
          allowBoolean: true,
        },
      ],
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      // node:test manages the promises of describe/it/before/after itself.
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-implied-eval": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
);
