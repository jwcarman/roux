import { defineConfig } from "vitest/config";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";

// Spring Boot serves the built app from its static resources; in development Vite serves it and
// passes the API and who's endpoints through to Spring Boot on :8080.
const backend = "http://localhost:8080";

export default defineConfig({
  // The router plugin generates src/routeTree.gen.ts from src/routes/ and splits each route into its
  // own chunk; it must come before react(). Its settings are in tsr.config.json. Under Vitest it
  // leaves out its hot-reload code, which no test can reach, so a route file's coverage is its own
  // code.
  plugins: [
    tanstackRouter({ codeSplittingOptions: { addHmr: !process.env.VITEST } }),
    react(),
  ],
  // roux-web is linked from roux's source (file:../../../web/roux-web). Resolving through the link
  // rather than to its real path makes its imports of React and the other peers find this app's
  // node_modules, so there is one React. Vitest reads this too.
  resolve: { preserveSymlinks: true },
  build: { outDir: "dist", emptyOutDir: true },
  // Every script and style tag Vite writes carries this placeholder, and a <meta property="csp-nonce">
  // holds it for the app's own use. Spring Boot replaces it with a fresh nonce on each response
  // (ShellController), matching its Content-Security-Policy header.
  html: { cspNonce: "__CSP_NONCE__" },
  server: {
    proxy: {
      "/api": backend,
      "/who": backend,
    },
  },
  // Tests run in Node; a component or hook test opts into jsdom with a `@vitest-environment jsdom` docblock.
  // roux-web goes through Vite, not Node's loader: Node would follow the link to roux's source and
  // load React and the other peers from roux's own node_modules, a second React.
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/testing/setup.ts"],
    server: { deps: { inline: ["@jwcarman/roux-web"] } },
  },
});
