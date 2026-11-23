import { createFileRoute, redirect } from "@tanstack/react-router";
import { openingRedirect } from "@jwcarman/roux-web/navigation";
import { nav } from "../../shell/nav";
import { Home } from "../../shell/Home";

export const Route = createFileRoute("/_signedIn/")({
  // Opening the app goes to the start place in nav.ts, when it is another page.
  // A guard that sent the caller to Home says so in the history state (see guards.ts).
  beforeLoad: ({ context, location }) => {
    const to = openingRedirect(nav, context.me.permissions, location.state.home === true);
    if (to) {
      throw redirect({ to });
    }
  },
  component: Home,
});
