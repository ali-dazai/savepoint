// ESLint: correctness only. Formatting is Prettier's job (eslint-config-prettier turns off the overlapping rules).
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default [
  { ignores: ["vendor/", "node_modules/", "test-results/"] },
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
  // The app: browser ES modules, no build step.
  {
    files: ["src/**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.browser } },
  },
  // Classic scripts loaded by index.html, and the service worker.
  {
    files: ["config.js"],
    languageOptions: { sourceType: "script", globals: { ...globals.browser } },
  },
  {
    files: ["sw.js"],
    languageOptions: { sourceType: "script", globals: { ...globals.serviceworker } },
  },
  // Node: the test runner, Playwright suites (whose page.evaluate callbacks run in the browser) and this config.
  {
    files: ["tests/**/*.js", "eslint.config.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
];
