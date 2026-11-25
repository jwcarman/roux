import { parseIsoDate } from "../dates/dates";
import { getJson } from "../api/client";

/**
 * What the server says about the organization (`roux.organization.*`, `roux.money.currency`): where
 * it is, how it writes, and what today is there. The page carries it in `#app-context`; `GET
 * /api/organization` answers it too.
 */
export interface OrganizationContext {
  /** The organization's IANA time zone (`America/New_York`). */
  timeZone: string;
  /** The organization's locale, a BCP 47 tag (`en-US`). */
  locale: string;
  /** The organization's date today (`2026-11-20`), by the server's clock. */
  today: string;
  /** When today ends (an instant): the browser asks for the new day then. */
  todayEndsAt: string;
  /** The app's currency (`USD`), or `null` when it has none. */
  currency: string | null;
  /** The currency's digits (`2`), or `null` when it has none. */
  fractionDigits: number | null;
}

/** Where the server answers the context. */
export const ORGANIZATION_PATH = "/api/roux/organization";

/** What `index.html` holds in `#app-context` until a server fills it in: Vite's dev server serves it so. */
export const CONTEXT_PLACEHOLDER = "__APP_CONTEXT__";

const NO_CONTEXT =
  "No organization context: call loadOrganization() before rendering (main.tsx), or setOrganization(testOrganization()) in a test's setup";

let current: OrganizationContext | undefined;
const listeners = new Set<() => void>();

function checked(raw: unknown, where: string): OrganizationContext {
  const refuse = (what: string): never => {
    throw new Error(`${where} ${what}`);
  };
  if (typeof raw !== "object" || raw === null) {
    return refuse("is not an object");
  }
  const context = raw as Record<string, unknown>;
  for (const field of ["timeZone", "locale", "today", "todayEndsAt"]) {
    const value = context[field];
    if (typeof value !== "string" || value.trim() === "") {
      refuse(`has no ${field}`);
    }
  }
  if (context.currency !== null && typeof context.currency !== "string") {
    refuse("has no currency");
  }
  if (context.fractionDigits !== null && typeof context.fractionDigits !== "number") {
    refuse("has no fractionDigits");
  }
  if ((context.currency === null) !== (context.fractionDigits === null)) {
    refuse("has a currency without its fractionDigits, or digits without a currency");
  }
  const timeZone = context.timeZone as string;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    refuse(`has a time zone this browser does not know: ${timeZone}`);
  }
  if (parseIsoDate(context.today as string) === undefined) {
    refuse(`has a today that is not a date: ${String(context.today)}`);
  }
  if (Number.isNaN(Date.parse(context.todayEndsAt as string))) {
    refuse(`has a todayEndsAt that is not a moment: ${String(context.todayEndsAt)}`);
  }
  const locale = context.locale as string;
  let known: string[];
  try {
    known = Intl.NumberFormat.supportedLocalesOf(locale);
  } catch {
    known = [];
  }
  if (known.length === 0) {
    refuse(`has a locale this browser does not know: ${locale}`);
  }
  return context as unknown as OrganizationContext;
}

/**
 * The context the server wrote into the page (`#app-context`, by roux's shell), or `undefined` when
 * the page has none or an unfilled placeholder (Vite's dev server). A malformed one is an error.
 */
export function readPageOrganization(doc: Document = document): OrganizationContext | undefined {
  const text = doc.getElementById("app-context")?.innerHTML.trim();
  if (text === undefined || text === "" || text === CONTEXT_PLACEHOLDER) {
    return undefined;
  }
  const where = "The page's organization context (#app-context)";
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`${where} is not JSON`);
  }
  return checked(raw, where);
}

/** Asks the server for the context now. */
export async function fetchOrganization(): Promise<OrganizationContext> {
  return checked(await getJson<unknown>(ORGANIZATION_PATH), `GET ${ORGANIZATION_PATH}'s context`);
}

/**
 * Makes the context available before the app renders: the page's, or the server's when the page has
 * none (development). `await` it in `main.tsx` before `render`.
 */
export async function loadOrganization(doc: Document = document): Promise<OrganizationContext> {
  const context = readPageOrganization(doc) ?? (await fetchOrganization());
  setOrganization(context);
  return context;
}

/** Sets the context (a test's setup, or a new day) and tells whoever watches today. */
export function setOrganization(context: OrganizationContext): void {
  current = context;
  listeners.forEach((listener) => listener());
}

/** Forgets the context: for a test that checks what happens without one. */
export function clearOrganization(): void {
  current = undefined;
}

/** The context; an error until one is loaded or set. */
export function organization(): OrganizationContext {
  if (current === undefined) {
    throw new Error(NO_CONTEXT);
  }
  return current;
}

/** The organization's date today (`2026-11-20`): the date for every default and every check. */
export function today(): string {
  return organization().today;
}

/** Calls the listener whenever the context changes (a new day); returns the unsubscribe function. */
export function onOrganizationChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A fixed context for tests: New York, `en-US`, USD, and today `2026-06-15`. Set it in the test
 * setup (`beforeEach(() => setOrganization(testOrganization()))`); a test changes a part with
 * `setOrganization(testOrganization({ today: "2026-06-30" }))`.
 */
export function testOrganization(overrides: Partial<OrganizationContext> = {}): OrganizationContext {
  return {
    timeZone: "America/New_York",
    locale: "en-US",
    today: "2026-06-15",
    todayEndsAt: "2026-06-16T04:00:00Z",
    currency: "USD",
    fractionDigits: 2,
    ...overrides,
  };
}
