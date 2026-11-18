import { createFileRoute, redirect } from "@tanstack/react-router";
import { openingRedirect } from "@jwcarman/roux-web/navigation";
import { nav } from "../../shell/nav";
import { Home } from "../../shell/Home";

/** `home: true` when a guard sent the caller here: show Home, not the start place. */
interface HomeSearch {
  home?: true;
}

export const Route = createFileRoute("/_signedIn/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch =>
    search.home === true || search.home === "true" ? { home: true } : {},
  // Opening the app goes to the start place in nav.ts, when it is another page.
  beforeLoad: ({ context, search }) => {
    const to = openingRedirect(nav, context.session.currentMe()?.permissions, search.home === true);
    if (to) {
      throw redirect({ to });
    }
  },
  component: Home,
});
