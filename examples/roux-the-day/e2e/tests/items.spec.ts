import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { ownerEmail, signInByLink } from "./helpers";

/** Signs the owner in and opens Items from the nav, once the surface has its counts and its list. */
async function openItems(page: Page, request: APIRequestContext) {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Items" })
    .click();
  await expect(page.getByRole("heading", { name: "Items" })).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
}

/** A Stat's number: its label is a term, its value the definition after it. */
function stat(page: Page, label: string): Locator {
  return page
    .getByRole("term")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .locator("xpath=following-sibling::*[1]");
}

async function statValue(page: Page, label: string): Promise<number> {
  return Number(await stat(page, label).textContent());
}

/** Adds items through the addItem command, as the signed-in page (its session and CSRF cookie). */
async function addItems(page: Page, titles: string[]) {
  await page.evaluate(async (all) => {
    const cookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith("XSRF-TOKEN="));
    const token = decodeURIComponent(cookie?.slice("XSRF-TOKEN=".length) ?? "");
    for (const title of all) {
      const response = await fetch("/api/commands/addItem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-XSRF-TOKEN": token,
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) {
        throw new Error(`addItem ${title}: ${response.status}`);
      }
    }
  }, titles);
}

/** The table's data rows (the header row has no cells). */
function dataRows(page: Page): Locator {
  return page
    .getByRole("table")
    .getByRole("row")
    .filter({ has: page.getByRole("cell") });
}

test("the owner adds an item for today, sees the counts move, and finds it by search and filter", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const title = `Order the venue ${stamp}`;
  await openItems(page, request);
  const open = await statValue(page, "Open");
  const today = await statValue(page, "Today");

  // Day left blank: the item is for today.
  const draftTitle = page.getByRole("textbox", { name: "New item" });
  await draftTitle.fill(title);
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Item added" }),
  ).toBeVisible();
  await expect(draftTitle).toHaveValue("");
  await expect(stat(page, "Open")).toHaveText(String(open + 1));
  await expect(stat(page, "Today")).toHaveText(String(today + 1));

  await page.getByRole("textbox", { name: "Search" }).fill(String(stamp));
  const row = dataRows(page).filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await expect(dataRows(page)).toHaveCount(1);
  await expect(row.getByText("Open")).toBeVisible();

  /** A chip of a filter group, such as "When" > "Overdue". */
  const chip = (group: string, name: string) =>
    page.getByRole("group", { name: group }).getByRole("button", { name });
  await expect(chip("When", "Any time")).toHaveAttribute("aria-pressed", "true");
  await chip("When", "Overdue").click();
  await expect(chip("When", "Overdue")).toHaveAttribute("aria-pressed", "true");
  await expect(chip("When", "Any time")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("No items yet")).toBeVisible();
  await chip("When", "Today").click();
  await expect(row).toHaveCount(1);
  await chip("Status", "Done").click();
  await expect(chip("Status", "Done")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("No items yet")).toBeVisible();
  await chip("Status", "Open").click();
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("cell", { name: "All day" })).toBeVisible();
  await chip("Assigned to", "Mine").click();
  await expect(chip("Assigned to", "Mine")).toHaveAttribute("aria-pressed", "true");
  await chip("Assigned to", "Anyone").click();
  await expect(row).toHaveCount(1);

  await row.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(title);
});

test("the list pages and sorts by title", async ({ page, request }) => {
  const stamp = Date.now();
  // One more than a page (20): page 2 holds the last.
  const titles = Array.from(
    { length: 21 },
    (_, i) => `Page ${stamp} ${String(i + 1).padStart(2, "0")}`,
  );
  await openItems(page, request);
  await addItems(page, titles);
  await page.getByRole("textbox", { name: "Search" }).fill(`Page ${stamp}`);
  await expect(dataRows(page)).toHaveCount(20);

  await page.getByRole("button", { name: "Title" }).click();
  await expect(dataRows(page).first()).toContainText(titles[0]);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(dataRows(page)).toHaveCount(1);
  await expect(dataRows(page).first()).toContainText(titles[20]);

  // Sorting again goes back to the first page, now Z to A.
  await page.getByRole("button", { name: "Title" }).click();
  await expect(dataRows(page)).toHaveCount(20);
  await expect(dataRows(page).first()).toContainText(titles[20]);
});

test("a blank title is caught on the page, and the server's word on a field shows under it", async ({
  page,
  request,
}) => {
  await openItems(page, request);
  const draftTitle = page.getByRole("textbox", { name: "New item" });
  const addForm = page.locator("[data-component-id=addForm]");

  const adds: string[] = [];
  page.on("request", (sent) => {
    if (sent.url().includes("/api/commands/addItem")) adds.push(sent.url());
  });

  // The surface's own check, on leaving the field: no request yet.
  await draftTitle.focus();
  await draftTitle.blur();
  await expect(addForm.getByText("Must not be blank")).toBeVisible();
  expect(adds).toEqual([]);

  // Too long a title: only the server knows the limit, and its message goes under Title.
  await draftTitle.fill("x".repeat(121));
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(
    addForm.getByText("Must be between 1 and 120 characters"),
  ).toBeVisible();
  await expect(draftTitle).toHaveValue("x".repeat(121));
  expect(adds).toHaveLength(1);
});
