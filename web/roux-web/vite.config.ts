import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const { exports, peerDependencies } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  exports: Record<string, unknown>;
  peerDependencies: Record<string, string>;
};
// One entry per subpath export ("./money" builds src/money/index.ts): adding a subpath is one entry in
// package.json's "exports", which the guide checker reads too.
const entries = Object.keys(exports).map((subpath) => subpath.replace(/^\.\//, ""));
const peers = Object.keys(peerDependencies);

export default defineConfig({
  build: {
    lib: {
      entry: Object.fromEntries(entries.map((name) => [`${name}/index`, `src/${name}/index.ts`])),
      formats: ["es"],
    },
    // tsc writes the declarations into dist first; the build must not delete them.
    emptyOutDir: false,
    rolldownOptions: {
      // Peer dependencies, and their subpaths, are the app's to provide.
      external: (id) => peers.some((peer) => id === peer || id.startsWith(`${peer}/`)),
      output: { preserveModules: true, preserveModulesRoot: "src", entryFileNames: "[name].js" },
    },
  },
  // Tests run in Node; a component or hook test opts into jsdom with a `@vitest-environment jsdom` docblock.
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/testing/setup/index.ts"],
    // A Chakra page test clicking through a form takes about a second here and can pass five on a
    // shared CI runner under coverage; a hung test still fails, just later.
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      // lcov is what SonarCloud reads; text is the summary printed after the run.
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/testing/{contracts,css,fakeServer,location,router,validationMessages}.*",
        "src/**/index.ts",
        "src/**/*.test.*",
      ],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
