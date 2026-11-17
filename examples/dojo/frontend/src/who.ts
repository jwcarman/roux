import { createWhoClient } from "@jwcarman/who-client";

/** who's browser endpoints, typed: sign-in, sign-out, and the signed-in person's own account. */
export const who = createWhoClient();
