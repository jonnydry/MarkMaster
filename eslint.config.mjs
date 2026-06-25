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
    files: ["src/**/*.{ts,tsx}"],
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
        {
          selector: "TemplateElement[value.raw=/rounded-(xl|2xl|3xl|4xl)(?![-a-z])/]",
          message:
            "Off-contract radius — components use rounded-sm (micro-elements rounded-[2px]; circles rounded-full).",
        },
        {
          selector: "Literal[value=/\brounded-(lg|md)\b/]",
          message:
            "Off-contract radius — components use rounded-sm (micro-elements rounded-[2px]; circles rounded-full).",
        },
        {
          selector: "TemplateElement[value.raw=/\brounded-(lg|md)\b/]",
          message:
            "Off-contract radius — components use rounded-sm (micro-elements rounded-[2px]; circles rounded-full).",
        },
        {
          selector:
            "Literal[value=/\bbg-surface-[^\\s\"']+.*\bdark:(?:[^\\s\"']*:)*(?:bg-|border-white)/]",
          message:
            "Dark-modified surface hand-roll — rely on surface-* utilities and theme tokens instead of dark:bg-white/... overrides.",
        },
        {
          selector:
            "TemplateElement[value.raw=/\bbg-surface-[^\\s\"'`]+.*\bdark:(?:[^\\s\"'`]*:)*(?:bg-|border-white)/]",
          message:
            "Dark-modified surface hand-roll — rely on surface-* utilities and theme tokens instead of dark:bg-white/... overrides.",
        },
        {
          selector: "Literal[value=/(?:^|\\s)shadow-[\\[]/]",
          message:
            "Custom arbitrary shadow — use surface-overlay or a sanctioned surface utility; only surface-overlay's stage shadow is permitted.",
        },
        {
          selector: "TemplateElement[value.raw=/(?:^|\\s)shadow-[\\[]/]",
          message:
            "Custom arbitrary shadow — use surface-overlay or a sanctioned surface utility; only surface-overlay's stage shadow is permitted.",
        },
      ],
    },
  },
  {
    // Auth splash is allowed intentional glow/shadow effects for marketing chrome.
    files: ["src/components/auth/**"],
    rules: {
      "no-restricted-syntax": "off",
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
