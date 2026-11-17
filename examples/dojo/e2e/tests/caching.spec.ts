import { expect, test } from "@playwright/test";

// The cache rules a browser or a CDN in front of the app sees, on the JVM and in the native image.
test("hashed assets are cached for a year and the shell is never stored", async ({
  request,
}) => {
  const shell = await request.get("/", { headers: { Accept: "text/html" } });
  expect(shell.ok()).toBe(true);
  // Each copy carries its own Content-Security-Policy nonce, so none may be reused.
  expect(shell.headers()["cache-control"]).toContain("no-store");

  const script = (await shell.text()).match(/src="(\/assets\/[^"]+)"/);
  expect(script).not.toBeNull();
  const asset = await request.get(script![1]);
  expect(asset.ok()).toBe(true);
  expect(asset.headers()["cache-control"]).toContain("immutable");
  expect(asset.headers()["cache-control"]).toContain("max-age=31536000");

  const head = await request.head(script![1]);
  expect(head.status()).toBe(200);
});
