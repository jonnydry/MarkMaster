import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    // Component tests (*.test.tsx) opt into jsdom via the
    // `// @vitest-environment jsdom` pragma at the top of the file.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      // Server logic and API routes — where unit/integration tests focus.
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/types/**",
        // Browser-only Pixi export shims are exercised by the Orbit map build
        // and browser smoke test. Rolldown's coverage parser cannot instrument
        // the type-only optional parameters in this module reliably.
        "src/lib/pixi-imports.ts",
        "**/*.d.ts",
      ],
      thresholds: {
        // Soft global floor on testable server code — ratchet upward over time.
        lines: 63,
        statements: 62,
        branches: 51,
        functions: 69,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/server-only.ts"),
      "next/font/google": path.resolve(__dirname, "src/test/next-font-google.mock.ts"),
    },
  },
});
