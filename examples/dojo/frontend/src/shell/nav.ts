import { LuAward, LuCalendar, LuGraduationCap, LuHouse, LuPalette, LuSettings, LuUsers } from "react-icons/lu";
import { defineNav } from "@jwcarman/roux-web/navigation";
import { PERMISSIONS } from "../api";

/**
 * The sidebar, in order. A new feature's page is one more entry: `to` must be a route that exists,
 * `permission` one of the server's (api.ts), and `icon` a Lucide component, or this does not compile.
 */
export const nav = defineNav(PERMISSIONS, [
  { label: "Home", to: "/", icon: LuHouse, description: "A welcome page.", start: true },
  {
    label: "Members",
    to: "/members",
    icon: LuUsers,
    permission: "members.read",
    description: "Who can use the app and what they may do.",
  },
  {
    label: "Ranks",
    to: "/ranks",
    icon: LuAward,
    permission: "ranks.read",
    description: "The school's belt ladder, lowest first.",
  },
  {
    label: "Students",
    to: "/students",
    icon: LuGraduationCap,
    permission: "students.read",
    description: "Who trains at the school and the rank each holds.",
  },
  {
    label: "Timetable",
    to: "/timetable",
    icon: LuCalendar,
    permission: "classes.read",
    description: "The week's classes: when each runs and who teaches it.",
  },
  {
    label: "Appearance",
    to: "/appearance",
    icon: LuPalette,
    permission: "theme.manage",
    description: "The app's colours, corners and font.",
  },
  { label: "Settings", to: "/settings", icon: LuSettings, description: "Your own account settings." },
]);
