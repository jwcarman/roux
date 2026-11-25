import { http, HttpResponse } from "msw";

/** The person `signedInAs` signs in: their profile, as `GET /api/roux/users/me` answers it. */
export const TEST_USER = {
  id: "id-1",
  displayName: "Test User",
  email: "test@example.org",
  version: 0,
} as const;

/**
 * The server's answers to the session's two requests (who is signed in, and their profile) for
 * TEST_USER holding `permissions`, or for nobody (`null`, both 401): `server.use(...signedInAs([ITEMS_READ]))`
 * before rendering the app, as a route test does.
 */
export function signedInAs(permissions: readonly string[] | null) {
  const nobody = () => new HttpResponse(null, { status: 401 });
  return [
    http.get("/api/roux/auth/me", () =>
      permissions === null ? nobody() : HttpResponse.json({ identityId: TEST_USER.id, permissions }),
    ),
    http.get("/api/roux/users/me", () => (permissions === null ? nobody() : HttpResponse.json(TEST_USER))),
  ];
}
