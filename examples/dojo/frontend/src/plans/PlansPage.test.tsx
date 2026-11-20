// @vitest-environment jsdom
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toaster } from "@jwcarman/roux-web/feedback";
import { PLANS_MANAGE } from "../permissions.gen";
import { invalidFields } from "../testing/problems";
import { renderRoute } from "../testing/route";
import { server } from "../testing/server";
import type { Plan } from "./plans";

const MONTHLY: Plan = {
  id: "p1",
  name: "Monthly unlimited",
  price: { minorUnits: 15000, currency: "USD" },
  period: "MONTHLY",
  active: true,
  inUse: false,
  version: 0,
};
const OLD: Plan = {
  ...MONTHLY,
  id: "p2",
  name: "Old yearly",
  period: "YEARLY",
  active: false,
  inUse: true,
};

function plans(...list: Plan[]) {
  server.use(http.get("/api/plans", () => HttpResponse.json(list)));
}

describe("PlansPage", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("lists each plan with its price per period, and marks the inactive ones", async () => {
    plans(MONTHLY, OLD);
    renderRoute("/plans", { permissions: [PLANS_MANAGE] });

    const table = await screen.findByRole("table", { name: "Plans" });
    expect(
      await within(table).findByText("$150.00 / month"),
    ).toBeInTheDocument();
    expect(within(table).getByText("$150.00 / year")).toBeInTheDocument();
    expect(within(table).getByText("Inactive")).toBeInTheDocument();
  });

  it("adds a plan, sending its price as money", async () => {
    plans();
    let sent: unknown;
    server.use(
      http.post("/api/plans", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(MONTHLY, { status: 201 });
      }),
    );
    renderRoute("/plans", { permissions: [PLANS_MANAGE] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "New plan" }));
    const dialog = await screen.findByRole("dialog", { name: "New plan" });
    await user.type(
      within(dialog).getByLabelText(/^Name/),
      "Monthly unlimited",
    );
    await user.type(within(dialog).getByLabelText(/^Price/), "150");
    await user.selectOptions(
      within(dialog).getByLabelText(/^Period/),
      "MONTHLY",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Monthly unlimited was saved",
    );
    expect(sent).toEqual({
      name: "Monthly unlimited",
      price: { minorUnits: 15000, currency: "USD" },
      period: "MONTHLY",
      active: true,
    });
  });

  it("shows the server's refusal of a name under the Name field", async () => {
    plans();
    server.use(
      http.post("/api/plans", () =>
        invalidFields({ name: "Another plan has this name" }),
      ),
    );
    renderRoute("/plans", { permissions: [PLANS_MANAGE] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "New plan" }));
    const dialog = await screen.findByRole("dialog", { name: "New plan" });
    await user.type(
      within(dialog).getByLabelText(/^Name/),
      "monthly unlimited",
    );
    await user.type(within(dialog).getByLabelText(/^Price/), "150");
    await user.selectOptions(
      within(dialog).getByLabelText(/^Period/),
      "MONTHLY",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(
      await within(dialog).findByText("Another plan has this name"),
    ).toBeInTheDocument();
  });

  it("edits a plan with its price filled in", async () => {
    plans(MONTHLY);
    renderRoute("/plans", { permissions: [PLANS_MANAGE] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Edit Monthly unlimited",
    });
    expect(within(dialog).getByLabelText(/^Price/)).toHaveValue("150.00");
  });

  it("offers no Remove for a plan in use, only Edit", async () => {
    plans(OLD);
    renderRoute("/plans", { permissions: [PLANS_MANAGE] });

    expect(
      await screen.findByRole("button", { name: "Edit" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove" }),
    ).not.toBeInTheDocument();
  });

  it("asks before removing, then removes", async () => {
    let removed = false;
    server.use(
      http.get("/api/plans", () => HttpResponse.json(removed ? [] : [MONTHLY])),
      http.delete("/api/plans/p1", () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute("/plans", { permissions: [PLANS_MANAGE] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Remove" }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Remove Monthly unlimited?",
    });
    expect(removed).toBe(false);
    await user.click(within(confirm).getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("No plans yet.")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Monthly unlimited was removed",
    );
  });
});
