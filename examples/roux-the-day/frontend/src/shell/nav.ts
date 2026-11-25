import { LuHouse, LuPalette, LuUsers } from "react-icons/lu";
import { defineNav } from "@jwcarman/roux-web/navigation";
import { PERMISSIONS } from "../permissions.gen";

/**
 * The sidebar, in order. A new feature's page is one more entry: `to` must be a route that exists,
 * `permission` one of the server's (api.ts), and `icon` a Lucide component, or this does not compile.
 * The person's own pages (Settings) are in the account menu (Layout.tsx), not here.
 */
export const nav = defineNav(PERMISSIONS, [
  {
    label: "Home",
    to: "/",
    icon: LuHouse,
    description: "A welcome page.",
    start: true,
  },
  {
    label: "Users",
    to: "/users",
    icon: LuUsers,
    permission: "users.read",
    description: "Who can use the app and what they may do.",
  },
  {
    label: "Appearance",
    to: "/appearance",
    icon: LuPalette,
    permission: "theme.manage",
    description: "The app's colours, corners and font.",
  },
]);
