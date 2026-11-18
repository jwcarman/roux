import { createWhoClient } from "@jwcarman/who-client";

/** who's browser endpoints at their default `/who` (roux serves the app and who from one origin). */
export const who = createWhoClient();
