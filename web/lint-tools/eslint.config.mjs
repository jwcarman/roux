import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ESLint config for web/roux-web, run from there (see README.md). Plugins and the parser resolve
// from this directory's node_modules, because roux-web itself has no ESLint (it needs TypeScript 6).
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "package.json"));
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const reactHooks = require("eslint-plugin-react-hooks");
const react = require("eslint-plugin-react");
const jsxA11y = require("eslint-plugin-jsx-a11y");
const prettier = require("eslint-config-prettier");

// The defect rules noir judges builders by (noir's ts-tools/eslint.config.mjs), as errors.
const defects = [
  "no-async-promise-executor",
  "no-compare-neg-zero",
  "no-cond-assign",
  "no-constant-binary-expression",
  "no-dupe-else-if",
  "no-dupe-keys",
  "no-duplicate-case",
  "no-fallthrough",
  "no-loss-of-precision",
  "no-self-assign",
  "no-self-compare",
  "no-sparse-arrays",
  "no-unreachable",
  "no-unsafe-finally",
  "no-unsafe-negation",
  "no-unsafe-optional-chaining",
  "use-isnan",
  "react/jsx-key",
  "react/jsx-no-duplicate-props",
  "react/jsx-no-script-url",
  "react/jsx-no-target-blank",
  "react/no-danger",
  "react/no-danger-with-children",
  "react/no-direct-mutation-state",
  "jsx-a11y/alt-text",
  "jsx-a11y/aria-props",
  "jsx-a11y/aria-proptypes",
  "jsx-a11y/aria-role",
  "jsx-a11y/role-has-required-aria-props",
  "jsx-a11y/role-supports-aria-props",
  "@typescript-eslint/await-thenable",
  "@typescript-eslint/no-array-delete",
  "@typescript-eslint/no-base-to-string",
  "@typescript-eslint/no-floating-promises",
  "@typescript-eslint/no-for-in-array",
  "@typescript-eslint/no-implied-eval",
  "@typescript-eslint/restrict-plus-operands",
];

export default tseslint.config(
  { ignores: ["dist", "coverage", "reports", ".stryker-tmp"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    plugins: { react, "jsx-a11y": jsxA11y },
    languageOptions: {
      parserOptions: { project: ["tsconfig.test.json"], tsconfigRootDir: process.cwd() },
    },
    settings: { react: { version: "19.0" } },
    rules: {
      ...Object.fromEntries(defects.map((rule) => [rule, "error"])),
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      "no-restricted-syntax": ["error", { selector: "ImportNamespaceSpecifier", message: "No star imports: import each name you use" }],
    },
  },
  prettier,
);
