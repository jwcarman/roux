import { expect, test, type Page } from "@playwright/test";
import { openDialog, ownerEmail, signInByLink } from "./helpers";

const tag = `pay${Date.now().toString(36)}`;
const plan = `Monthly ${tag}`;
const maya = { first: "Maya", last: `Chen ${tag}` };
const mayaName = `${maya.first} ${maya.last}`;

/** A date as the browser's date inputs write it, in this machine's time zone. */
function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// A week ago, not today: the server's "today" is UTC's and the browser's is local, so a start a
// week back is overdue whatever this machine's time zone (FINDINGS: roux has no school time zone).
const weekAgo = new Date();
weekAgo.setDate(weekAgo.getDate() - 7);

function nav(page: Page, place: string) {
  return page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: place });
}

async function overdueList(page: Page) {
  await nav(page, "Students").click();
  await page.getByLabel("Search students").fill(tag);
  await page.getByRole("button", { name: "Overdue" }).click();
  return page.getByRole("table", { name: "Students" });
}

test("the owner records a payment, and paid through moves", async ({ page, request }) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);

  // A plan, at $150 a month.
  await nav(page, "Plans").click();
  const planDialog = await openDialog(page, "New plan", "New plan");
  await planDialog.getByLabel("Name").fill(plan);
  await planDialog.getByLabel("Price").fill("150");
  await planDialog.getByLabel("Period").selectOption("MONTHLY");
  await planDialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${plan} was saved` })).toBeVisible();
  await expect(page.getByRole("table", { name: "Plans" }).getByRole("row", { name: new RegExp(plan) })).toContainText(
    "$150.00 / month",
  );

  // A student on it from a week ago, with nothing paid: overdue.
  await nav(page, "Students").click();
  const studentDialog = await openDialog(page, "New student", "New student");
  await studentDialog.getByLabel("First name").fill(maya.first);
  await studentDialog.getByLabel("Last name").fill(maya.last);
  await studentDialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${mayaName} was saved` })).toBeVisible();
  await page.getByLabel("Search students").fill(tag);
  await page.getByRole("link", { name: mayaName, exact: true }).click();
  await expect(page.getByRole("heading", { name: mayaName, level: 2 })).toBeVisible();

  const start = await openDialog(page, "Start membership", `Start a membership for ${mayaName}`);
  await start.getByLabel("Plan").selectOption({ label: `${plan} ($150.00 / month)` });
  await start.getByLabel("Start date").fill(isoDate(weekAgo));
  await start.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Overdue")).toBeVisible();

  let list = await overdueList(page);
  await expect(list.getByRole("row", { name: new RegExp(mayaName) })).toContainText("Overdue");

  // One month paid: paid through moves a month on, and she leaves the Overdue filter.
  await list.getByRole("link", { name: mayaName, exact: true }).click();
  const paidThroughBefore = await page.getByText(/^Paid through /).textContent();
  const pay = await openDialog(page, "Record payment", `Record a payment from ${mayaName}`);
  await pay.getByLabel("Method").selectOption("CASH");
  await expect(pay.getByText("1 × $150.00 = $150.00")).toBeVisible();
  await pay.getByRole("button", { name: "Record" }).click();
  await expect(page.getByRole("status").filter({ hasText: "The payment was recorded" })).toBeVisible();
  await expect(page.getByText(/^Paid through /)).not.toHaveText(paidThroughBefore ?? "");
  await expect(page.getByText("Overdue")).toHaveCount(0);

  list = await overdueList(page);
  await expect(list.getByRole("row", { name: new RegExp(mayaName) })).toHaveCount(0);

  // The Payments page has it among this month's payments (taken today).
  await nav(page, "Payments").click();
  const thisMonth = page.getByRole("table", { name: "This month's payments" });
  await expect(thisMonth.getByRole("row", { name: new RegExp(mayaName) })).toContainText("$150.00");
});
