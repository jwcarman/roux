import { defineConfig } from "@playwright/test";

// Run by E2eIT, which starts Postgres, Mailpit and the app first. The suite only knows the URLs
// it is given, so it runs unchanged against the JVM build or the native binary.
export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  retries: 0,
  // One app and one inbox shared by every test: run them one at a time.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  reporter: [["list"]],
});
