import { defineConfig, type Plugin } from "vitest/config";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";

// The Go server serves the built app (embedded with `make build`); in development (`make dev`) Vite
// serves it at http://localhost:5173, the one address people use, and passes the API, roux's own
// endpoints under /api/roux among it, through to the server on :8080. It leaves Host and Origin as the
// browser sent them, which passkeys need: the server is started with PUBLIC_URL set to this address.
const backend = "http://localhost:8080";

// In `make dev` the page is the server's shell: roux fills in index.html (the app's name, the owner's
// theme, the organization), as a deployment does, so the page Vite serves is the page users get.
// `make dev` runs the server with FRONTEND_DIR=frontend for it. Vite then adds its own scripts.
function serverShell(): Plugin {
  return {
    name: "server-shell",
    apply: "serve",
    transformIndexHtml: {
      order: "pre",
      async handler() {
        const shell = await fetch(`${backend}/`, { headers: { accept: "text/html" } }).catch(() => undefined);
        if (!shell?.ok) {
          throw new Error(
            `The server at ${backend} is not answering (make dev's air may still be building it, or a Go build failed: see the terminal). Reload once it is up.`,
          );
        }
        return shell.text();
      },
    },
  };
}

export default defineConfig({
  // The router plugin generates src/routeTree.gen.ts from src/routes/ and splits each route into its
  // own chunk; it must come before react(). Its settings are in tsr.config.json. Under Vitest it
  // leaves out its hot-reload code, which no test can reach, so a route file's coverage is its own
  // code.
  plugins: [tanstackRouter({ codeSplittingOptions: { addHmr: !process.env.VITEST } }), react(), serverShell()],
  // Inside roux's own repository roux-web is a link to its source. Resolving through a link rather
  // than to its real path makes its imports of React and the other peers find this app's
  // node_modules, so there is one React; from npm it changes nothing. Vitest reads this too.
  resolve: { preserveSymlinks: true },
  build: { outDir: "dist", emptyOutDir: true },
  // Every script and style tag Vite writes carries this placeholder, and a <meta property="csp-nonce">
  // holds it for the app's own use. The server replaces it with a fresh nonce on each response
  // (roux serves the shell), matching its Content-Security-Policy header.
  html: { cspNonce: "__CSP_NONCE__" },
  server: {
    // Not the next free port: the address in `make dev`'s output and in PUBLIC_URL is this one.
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": backend,
      "/api/roux/auth": backend,
    },
  },
  // Tests run in Node; a component or hook test opts into jsdom with a `@vitest-environment jsdom` docblock.
  // roux-web goes through Vite, not Node's loader: inside roux's repository Node would follow the
  // link to roux's source and load React and the other peers from roux's own node_modules, a second
  // React.
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/testing/setup.ts"],
    server: { deps: { inline: ["@jwcarman/roux-web"] } },
    // Every line, branch, function and statement covered, or the build fails. Generated files and
    // test helpers are not the app's code.
    coverage: {
      provider: "v8",
      // lcov is what SonarCloud reads; text is the summary printed after the run.
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.*", "src/testing/**", "src/routeTree.gen.ts", "src/permissions.gen.ts"],
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
