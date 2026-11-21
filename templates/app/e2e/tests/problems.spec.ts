import { expect, test } from "@playwright/test";
import { ownerEmail, signInByLink } from "./helpers";

// Every API error is an RFC 9457 Problem Detail, on the JVM and in the native binary (where the
// field errors and the validation messages depend on native hints).
test("API errors are Problem Details", async ({ page, request }) => {
  const signedOut = await request.get("/api/users", { headers: { Accept: "application/json" } });
  expect(signedOut.status()).toBe(401);
  expect(signedOut.headers()["content-type"]).toContain("application/problem+json");
  expect(await signedOut.json()).toMatchObject({ status: 401, detail: "Sign in to continue" });

  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  const invalid = await page.evaluate(async () => {
    const token = decodeURIComponent(document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? "");
    const response = await fetch("/api/users/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-XSRF-TOKEN": token },
      body: JSON.stringify({ name: "", email: "not-an-address", role: "USER" }),
    });
    return { status: response.status, type: response.headers.get("Content-Type"), body: await response.json() };
  });
  expect(invalid.status).toBe(400);
  expect(invalid.type).toContain("application/problem+json");
  expect(invalid.body).toMatchObject({
    detail: "The request has invalid fields",
    errors: [
      { field: "email", message: "Must be a valid email address" },
      { field: "name", message: "Must not be blank" },
    ],
  });
});
