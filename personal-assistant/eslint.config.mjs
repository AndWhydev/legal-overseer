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
    // macOS metadata files
    "**/._%",
    "**/._*",
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
      // Downgrade preserve-manual-memoization to warning (pre-existing
      // violations in kanban.tsx, creator-studio-tab.tsx). TODO: audit
      // memoization incrementally.
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/use-memo": "warn",
      // Allow unescaped entities in JSX (common in copy text)
      "react/no-unescaped-entities": "warn",
      // Allow @ts-nocheck in test/dev files
      "@typescript-eslint/ban-ts-comment": "warn",
      // Visual design must live in Tailwind classes / shadcn components, not
      // inline style={{}}. See COMPONENT_CONTRACTS.md anti-patterns.
      // Warn-only (not error) because ~100 existing files still use this
      // pattern — they'll be migrated progressively. Prevents new regressions.
      // Allowed: layout/dynamic style (transform, position, opacity,
      // animation, etc.) — these are not visual design concerns.
      "no-restricted-syntax": [
        "warn",
        {
          selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression > Property[key.name=/^(background|backgroundColor|backgroundImage|color|border|borderColor|borderTop|borderBottom|borderLeft|borderRight|borderStyle|borderWidth|boxShadow|fontSize|fontWeight|fontFamily|lineHeight|letterSpacing)$/]",
          message:
            "Inline style={{}} for visual design is disallowed. Use Tailwind classes (bg-*, text-*, border-*, shadow-*) or shadcn semantic tokens (bg-card, bg-muted, etc.). See COMPONENT_CONTRACTS.md. Exception: truly dynamic values (e.g. data-driven colors) — use a CSS var and set it inline via style={{ '--my-var': value }} then reference it in a class.",
        },
      ],
    },
  },
]);

export default eslintConfig;
