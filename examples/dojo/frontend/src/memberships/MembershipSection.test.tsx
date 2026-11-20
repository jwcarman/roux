// @vitest-environment jsdom
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toaster } from "@jwcarman/roux-web/feedback";
import { PAYMENTS_RECORD, STUDENTS_READ } from "../permissions.gen";
import type { Plan } from "../plans/plans";
import type { StudentDetail } from "../students/students";
import { invalidFields } from "../testing/problems";
import { renderRoute } from "../testing/route";
import { server } from "../testing/server";
import { defaultStartDate, type MembershipView, type StudentMemberships } from "./memberships";

const MAYA: StudentDetail = {
  id: "s1",
  firstName: "Maya",
  lastName: "Chen",
  email: null,
  phone: null,
  birthDate: null,
  startDate: "2026-01-01",
  status: "ACTIVE",
  currentRank: null,
  version: 0,
  promotions: [],
};

const MONTHLY: Plan = {
  id: "p1",
  name: "Monthly unlimited",
  price: { minorUnits: 15000, currency: "USD" },
  period: "MONTHLY",
  active: true,
  inUse: true,
  version: 0,
};

const CURRENT: MembershipView = {
  id: "m1",
  plan: { id: "p1", name: "Monthly unlimited", price: MONTHLY.price, period: "MONTHLY" },
  startDate: "2026-03-15",
  endDate: null,
  paidThrough: "2026-04-14",
  overdue: true,
  payments: [
    {
      id: "pay1",
      takenOn: "2026-03-15",
      periods: 1,
      amount: { minorUnits: 15000, currency: "USD" },
      method: "CASH",
      note: null,
      recordedByName: "Ivy Instructor",
    },
  ],
};

const RECORDS = { permissions: [STUDENTS_READ, PAYMENTS_RECORD] };

/** The student page's endpoints, with `memberships` (which a test may change) for Maya. */
function serve(memberships: () => StudentMemberships) {
  server.use(
    http.get("/api/students/s1", () => HttpResponse.json(MAYA)),
    http.get("/api/plans/active", () => HttpResponse.json([MONTHLY])),
    http.get("/api/students/s1/memberships", () => HttpResponse.json(memberships())),
  );
}

describe("defaultStartDate", () => {
  it("is the day after paid through when that is after today, else today", () => {
    expect(defaultStartDate({ ...CURRENT, paidThrough: "2026-05-14" }, "2026-04-01")).toBe("2026-05-15");
    expect(defaultStartDate({ ...CURRENT, paidThrough: "2026-04-01" }, "2026-04-01")).toBe("2026-04-02");
    expect(defaultStartDate({ ...CURRENT, paidThrough: "2026-03-31" }, "2026-04-01")).toBe("2026-04-01");
    expect(defaultStartDate(null, "2026-04-01")).toBe("2026-04-01");
  });

  it("is never on or before the current membership's start, which the server refuses", () => {
    // Started today, nothing paid (paid through yesterday): a correction starts tomorrow.
    expect(
      defaultStartDate({ ...CURRENT, startDate: "2026-04-01", paidThrough: "2026-03-31" }, "2026-04-01"),
    ).toBe("2026-04-02");
    // Starts ahead, nothing paid (paid through the day before it): the day after its start.
    expect(
      defaultStartDate({ ...CURRENT, startDate: "2026-05-01", paidThrough: "2026-04-30" }, "2026-04-01"),
    ).toBe("2026-05-02");
  });

  it("crosses a month end", () => {
    expect(defaultStartDate({ ...CURRENT, paidThrough: "2026-04-30" }, "2026-04-01")).toBe("2026-05-01");
  });
});

describe("MembershipSection", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("shows the current plan, paid through and an Overdue badge, and its payments", async () => {
    serve(() => ({ current: CURRENT, past: [] }));
    renderRoute("/students/s1", RECORDS);

    expect(await screen.findByText("Paid through Apr 14, 2026")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Monthly unlimited · $150.00 / month")).toBeInTheDocument();
    const payments = screen.getByRole("table", { name: "Payments" });
    expect(within(payments).getByRole("row", { name: /Mar 15, 2026/ })).toHaveTextContent("Ivy Instructor");
  });

  it("says when the student has no membership", async () => {
    serve(() => ({ current: null, past: [] }));
    renderRoute("/students/s1", RECORDS);

    expect(await screen.findByText("No membership yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record payment" })).not.toBeInTheDocument();
  });

  it("starts a change of plan when the paid time runs out, and warns before starting earlier", async () => {
    serve(() => ({ current: { ...CURRENT, paidThrough: "2099-05-14", overdue: false }, past: [] }));
    renderRoute("/students/s1", RECORDS);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Start membership" }));
    const dialog = await screen.findByRole("dialog", { name: "Start a membership for Maya Chen" });
    const start = within(dialog).getByLabelText(/^Start date/);
    expect(start).toHaveValue("2099-05-15");
    expect(within(dialog).queryByText(/starting earlier/)).not.toBeInTheDocument();

    await user.clear(start);
    await user.type(start, "2099-05-01");

    expect(
      await within(dialog).findByText(
        "Maya is paid through May 14, 2099; starting earlier gives up the paid time after that.",
      ),
    ).toBeInTheDocument();
  });

  it("starts today when nothing is paid ahead, and shows the server's refusal under Start date", async () => {
    serve(() => ({ current: CURRENT, past: [] }));
    server.use(
      http.post("/api/students/s1/memberships", () =>
        invalidFields({ startDate: "Must be after the current membership's start (2026-03-15)" }),
      ),
    );
    renderRoute("/students/s1", RECORDS);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Start membership" }));
    const dialog = await screen.findByRole("dialog", { name: "Start a membership for Maya Chen" });
    expect(within(dialog).getByLabelText(/^Start date/)).toHaveValue("2026-06-15");
    await user.selectOptions(within(dialog).getByLabelText(/^Plan/), "p1");
    await user.click(within(dialog).getByRole("button", { name: "Start" }));

    expect(
      await within(dialog).findByText("Must be after the current membership's start (2026-03-15)"),
    ).toBeInTheDocument();
  });

  it("records a payment, showing its amount before saving", async () => {
    serve(() => ({ current: CURRENT, past: [] }));
    let sent: unknown;
    server.use(
      http.post("/api/students/s1/payments", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(CURRENT.payments[0], { status: 201 });
      }),
    );
    renderRoute("/students/s1", RECORDS);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    const dialog = await screen.findByRole("dialog", { name: "Record a payment from Maya Chen" });
    const periods = within(dialog).getByLabelText(/^Months/);
    await user.clear(periods);
    await user.type(periods, "2");
    await user.selectOptions(within(dialog).getByLabelText(/^Method/), "CARD");

    expect(within(dialog).getByText("2 × $150.00 = $300.00")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Record" }));

    expect(await screen.findByRole("status")).toHaveTextContent("The payment was recorded");
    expect(sent).toEqual({ periods: 2, takenOn: "2026-06-15", method: "CARD", note: null });
  });

  it("asks before removing a payment, then removes it", async () => {
    let removed = false;
    serve(() => ({ current: { ...CURRENT, payments: removed ? [] : CURRENT.payments }, past: [] }));
    server.use(
      http.delete("/api/students/s1/payments/pay1", () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute("/students/s1", RECORDS);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Remove the payment of Mar 15, 2026" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Remove this payment?" });
    expect(removed).toBe(false);
    await user.click(within(confirm).getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("No payments yet.")).toBeInTheDocument();
  });

  it("lists ended memberships with their payments", async () => {
    serve(() => ({
      current: { ...CURRENT, startDate: "2026-05-15", payments: [] },
      past: [{ ...CURRENT, endDate: "2026-05-14", overdue: false }],
    }));
    renderRoute("/students/s1", RECORDS);

    expect(await screen.findByText("Monthly unlimited, Mar 15, 2026 – May 14, 2026")).toBeInTheDocument();
  });

  it("is not shown without payments.record", async () => {
    serve(() => ({ current: CURRENT, past: [] }));
    renderRoute("/students/s1", { permissions: [STUDENTS_READ] });

    expect(await screen.findByRole("heading", { name: "Maya Chen" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Membership" })).not.toBeInTheDocument();
  });
});
