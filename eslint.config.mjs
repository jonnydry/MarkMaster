import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    // Design language guardrails — see "Design language contract" in AGENTS.md.
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/rounded-sm border border-hairline-(soft|strong) bg-surface-/]",
          message:
            "Hand-rolled surface recipe — use a surface-* utility (surface-card/veil/solid/inset/inset-strong/overlay) from globals.css.",
        },
        {
          selector:
            "TemplateElement[value.raw=/rounded-sm border border-hairline-(soft|strong) bg-surface-/]",
          message:
            "Hand-rolled surface recipe — use a surface-* utility (surface-card/veil/solid/inset/inset-strong/overlay) from globals.css.",
        },
        {
          selector:
            "Literal[value=/tracking-.0[.](?!08em|14em)[0-9]+em./]",
          message:
            "Off-contract tracking — labels use tracking-[0.08em] (micro), tracking-wider (sections), or tracking-[0.14em] (chrome).",
        },
        {
          selector: "Literal[value=/focus-visible:ring-primary/]",
          message:
            "Off-contract focus ring — use focus-visible:ring-2 focus-visible:ring-ring/45.",
        },
        {
          selector: "Literal[value=/rounded-(xl|2xl|3xl|4xl)(?![-a-z])/]",
          message:
            "Off-contract radius — components use rounded-sm (micro-elements rounded-[2px]; circles rounded-full).",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
