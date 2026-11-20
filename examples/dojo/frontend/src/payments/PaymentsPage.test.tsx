// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { navItemsFor } from "@jwcarman/roux-web/navigation";
import {
  PAYMENTS_READ,
  PAYMENTS_RECORD,
  PLANS_MANAGE,
} from "../permissions.gen";
import { nav } from "../shell/nav";
import { pageOf } from "../testing/fakeServer";
import { renderRoute } from "../testing/route";
import { server } from "../testing/server";
import type { MonthlyTotal, PaymentListEntry } from "./payments";

const usd = (minorUnits: number) => ({ minorUnits, currency: "USD" });

const MONTHS: MonthlyTotal[] = [
  ...Array.from({ length: 10 }, (_, i) => ({
    month: `2025-${String(i + 5).padStart(2, "0")}`
      .replace("2025-13", "2026-01")
      .replace("2025-14", "2026-02"),
    total: usd(0),
  })),
  { month: "2026-03", total: usd(15000) },
  { month: "2026-04", total: usd(30000) },
];

const PAYMENT: PaymentListEntry = {
  id: "pay1",
  takenOn: "2026-04-10",
  studentId: "s1",
  studentName: "Maya Chen",
  planName: "Monthly unlimited",
  periods: 2,
  amount: usd(30000),
  method: "CARD",
  recordedByName: "Ivy Instructor",
};

describe("PaymentsPage", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/payments/monthly", () => HttpResponse.json(MONTHS)),
      http.get("/api/payments", () =>
        HttpResponse.json(pageOf([PAYMENT], { pageIndex: 0, pageSize: 25 })),
      ),
    );
  });

  it("shows twelve months of money taken, a month with none as zero, right-aligned", async () => {
    renderRoute("/payments", { permissions: [PAYMENTS_READ] });

    const months = await screen.findByRole("table", {
      name: "Money taken by month",
    });
    expect(await within(months).findAllByRole("row")).toHaveLength(13);
    const april = within(months).getByRole("row", { name: /Apr 2026/ });
    expect(april).toHaveTextContent("$300.00");
    expect(within(april).getByText("$300.00")).toHaveStyle({
      textAlign: "end",
    });
    expect(
      within(months).getByRole("row", { name: /May 2025/ }),
    ).toHaveTextContent("$0.00");
  });

  it("lists this month's payments with a link to each student", async () => {
    renderRoute("/payments", { permissions: [PAYMENTS_READ] });

    const list = await screen.findByRole("table", {
      name: "This month's payments",
    });
    const row = await within(list).findByRole("row", { name: /Maya Chen/ });
    expect(row).toHaveTextContent("Apr 10, 2026");
    expect(row).toHaveTextContent("Monthly unlimited");
    expect(row).toHaveTextContent("$300.00");
    expect(row).toHaveTextContent("Card");
    expect(row).toHaveTextContent("Ivy Instructor");
    expect(
      within(row).getByRole("link", { name: "Maya Chen" }),
    ).toHaveAttribute("href", "/students/s1");
  });

  it("is in the nav for the owner only", () => {
    expect(
      navItemsFor(nav, [PAYMENTS_READ]).map((item) => item.label),
    ).toContain("Payments");
    expect(
      navItemsFor(nav, [PAYMENTS_RECORD, PLANS_MANAGE]).map(
        (item) => item.label,
      ),
    ).not.toContain("Payments");
  });
});
