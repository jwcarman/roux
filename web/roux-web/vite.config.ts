import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// One entry per subpath export: adding a subpath is one name here and one entry in package.json's "exports".
const entries = ["problem", "api", "paging", "table", "feedback", "form", "dates", "theme", "signin", "navigation", "money", "organization"];

const { peerDependencies } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  peerDependencies: Record<string, string>;
};
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
    setupFiles: ["src/testing/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/testing/**", "src/**/index.ts", "src/**/*.test.*"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
