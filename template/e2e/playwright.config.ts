import { defineConfig } from "@playwright/test";

// Run by run.sh (make e2e), which starts Postgres, Mailpit and the app first. The suite only knows
// the URLs it is given. The organization's zone (ORG_TIME_ZONE, UTC unless set): "today" in a test
// is the organization's today, in the browser and in the test's own code, whatever zone the machine is in.
const organizationZone = "UTC";
process.env.TZ = organizationZone;

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
    timezoneId: organizationZone,
    trace: "retain-on-failure",
  },
  reporter: [["list"]],
});
