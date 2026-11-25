import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "@jwcarman/roux-web/api";
import { loadOrganization, startDayWatch } from "@jwcarman/roux-web/organization";
import { App, createAppRouter } from "./App";

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

// The organization's zone, locale, currency and today: in the page the server sent, or (Vite's dev server)
// asked for before anything renders (a failure says why on the page, not only in the console). Then the
// app moves to the next day when the organization's day ends.
await loadOrganization().catch((error: unknown) => {
  document.getElementById("root")!.textContent = `The app could not start: ${String(error)}`;
  throw error;
});
startDayWatch(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App queryClient={queryClient} router={router} />
  </StrictMode>,
);
