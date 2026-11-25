import js from "@eslint/js";
import react from "@eslint-react/eslint-plugin";
import prettier from "eslint-config-prettier";
import jsxA11y from "eslint-plugin-jsx-a11y-x";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// ESLint config for the front end, run from frontend/ (npm run lint). The imports resolve from this
// directory's node_modules, beside this file: the front end has no ESLint of its own, since
// typescript-eslint needs TypeScript 6 and the app compiles with 7. npm run lint, format and
// format:check install it when it is missing.

// The defect rules, as errors: noir's list (its ts-tools/eslint.config.mjs), on ESLint 10's plugins.
// A duplicated JSX attribute needs no rule: TypeScript refuses one (TS17001).
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
  "@eslint-react/no-missing-key",
  "@eslint-react/no-duplicate-key",
  "@eslint-react/dom-no-script-url",
  "@eslint-react/dom-no-unsafe-target-blank",
  "@eslint-react/dom-no-dangerously-set-innerhtml",
  "@eslint-react/dom-no-dangerously-set-innerhtml-with-children",
  "@eslint-react/no-direct-mutation-state",
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
  { ignores: ["dist", "coverage", "reports", ".stryker-tmp", "lint-tools", "src/routeTree.gen.ts"] },
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
    plugins: { "@eslint-react": react, "jsx-a11y": jsxA11y },
    languageOptions: {
      parserOptions: { project: ["tsconfig.json"], tsconfigRootDir: process.cwd() },
    },
    settings: { "react-x": { version: "19.0" } },
    rules: {
      ...Object.fromEntries(defects.map((rule) => [rule, "error"])),
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      "no-restricted-syntax": [
        "error",
        { selector: "ImportNamespaceSpecifier", message: "No star imports: import each name you use" },
      ],
      // One import per module, types included (Sonar's S3863).
      "no-duplicate-imports": "error",
    },
  },
  // The build's own scripts (stryker-route-paths.mjs) are plain JavaScript, outside the TypeScript project.
  { files: ["**/*.{js,mjs,cjs}"], ...tseslint.configs.disableTypeChecked },
  prettier,
);
