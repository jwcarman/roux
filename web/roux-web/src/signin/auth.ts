import { createAuthClient } from "../auth";

/** roux's sign-in and account endpoints, at /api/roux/auth on the app's own origin. */
export const auth = createAuthClient();
