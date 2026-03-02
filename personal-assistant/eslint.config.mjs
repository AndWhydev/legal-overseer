import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Downgrade to warn — codebase uses `any` extensively in agent/channel code
      // TODO: progressively type these as the codebase matures
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow unused vars prefixed with _ (common pattern for ignored params)
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // React Compiler plugin rules — downgrade to warn (pre-existing violations)
      // TODO: fix incrementally
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      // Allow unescaped entities in JSX (common in copy text)
      "react/no-unescaped-entities": "warn",
      // Allow @ts-nocheck in test/dev files
      "@typescript-eslint/ban-ts-comment": "warn",
    },
  },
]);

export default eslintConfig;
