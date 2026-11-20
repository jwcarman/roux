import { createFileRoute } from "@tanstack/react-router";
import { PAYMENTS_READ } from "../../permissions.gen";
import { PaymentsPage } from "../../payments/PaymentsPage";
import { requirePermission } from "../../shell/guards";

export const Route = createFileRoute("/_signedIn/payments")({
  beforeLoad: ({ context }) => requirePermission(context.session.currentMe(), PAYMENTS_READ),
  component: PaymentsPage,
});
