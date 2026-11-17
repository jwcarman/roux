import { createFileRoute } from "@tanstack/react-router";
import { CLASSES_READ } from "../../api";
import { requirePermission } from "../../shell/guards";
import { TimetablePage } from "../../classes/TimetablePage";

export const Route = createFileRoute("/_signedIn/timetable")({
  beforeLoad: ({ context }) => requirePermission(context.session.currentMe(), CLASSES_READ),
  component: TimetablePage,
});
