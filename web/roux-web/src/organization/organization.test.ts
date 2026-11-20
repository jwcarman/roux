// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { server } from "../testing/server";
import {
  clearOrganization,
  loadOrganization,
  onOrganizationChange,
  organization,
  readPageOrganization,
  setOrganization,
  testOrganization,
  today,
  type OrganizationContext,
} from "./organization";

const DOJO: OrganizationContext = {
  timeZone: "America/New_York",
  locale: "en-US",
  today: "2026-11-20",
  todayEndsAt: "2026-11-21T05:00:00Z",
  currency: "USD",
  fractionDigits: 2,
};

function pageWith(text: string | null): Document {
  const doc = document.implementation.createHTMLDocument("page");
  if (text !== null) {
    const script = doc.createElement("script");
    script.type = "application/json";
    script.id = "app-context";
    script.textContent = text;
    doc.head.append(script);
  }
  return doc;
}

const read = (context: Record<string, unknown>) => () =>
  readPageOrganization(pageWith(JSON.stringify({ ...DOJO, ...context })));

afterEach(clearOrganization);

describe("readPageOrganization", () => {
  it("reads the page's context", () => {
    expect(readPageOrganization(pageWith(JSON.stringify(DOJO)))).toEqual(DOJO);
  });

  it("has none without the element, with it empty, or with the placeholder (Vite's dev server)", () => {
    expect(readPageOrganization(pageWith(null))).toBeUndefined();
    expect(readPageOrganization(pageWith("  "))).toBeUndefined();
    expect(readPageOrganization(pageWith("__APP_CONTEXT__"))).toBeUndefined();
  });

  it("reads the document by default", () => {
    document.head.innerHTML = `<script type="application/json" id="app-context">${JSON.stringify(DOJO)}</script>`;
    expect(readPageOrganization()).toEqual(DOJO);
    document.head.innerHTML = "";
  });

  it("refuses a context that is not JSON or not an object", () => {
    expect(() => readPageOrganization(pageWith("{"))).toThrow(
      "The page's organization context (#app-context) is not JSON",
    );
    expect(() => readPageOrganization(pageWith("3"))).toThrow(
      "The page's organization context (#app-context) is not an object",
    );
    expect(() => readPageOrganization(pageWith("null"))).toThrow("is not an object");
  });

  it("refuses a missing or blank field, naming it", () => {
    for (const field of ["timeZone", "locale", "today", "todayEndsAt"]) {
      expect(read({ [field]: undefined })).toThrow(`The page's organization context (#app-context) has no ${field}`);
      expect(read({ [field]: " " })).toThrow(`has no ${field}`);
    }
  });

  it("refuses a currency or digits of the wrong kind", () => {
    expect(read({ currency: 3 })).toThrow("has no currency");
    expect(read({ fractionDigits: "2" })).toThrow("has no fractionDigits");
    expect(read({ currency: null, fractionDigits: null })()).toMatchObject({ currency: null, fractionDigits: null });
    expect(read({ fractionDigits: null })).toThrow(
      "has a currency without its fractionDigits, or digits without a currency",
    );
    expect(read({ currency: null })).toThrow("has a currency without its fractionDigits");
  });

  it("refuses a time zone this browser does not know", () => {
    expect(read({ timeZone: "America/Nwe_York" })).toThrow(
      "has a time zone this browser does not know: America/Nwe_York",
    );
  });

  it("refuses a today that is not a date, and an end that is not a moment", () => {
    expect(read({ today: "2026-02-30" })).toThrow("has a today that is not a date: 2026-02-30");
    expect(read({ today: "tomorrow" })).toThrow("has a today that is not a date: tomorrow");
    expect(read({ todayEndsAt: "midnight" })).toThrow("has a todayEndsAt that is not a moment: midnight");
  });

  it("refuses a locale this browser does not know", () => {
    expect(read({ locale: "xx-YY" })).toThrow("has a locale this browser does not know: xx-YY");
    expect(read({ locale: "not a locale!" })).toThrow("has a locale this browser does not know: not a locale!");
  });
});

describe("organization", () => {
  it("is an error before any context is set", () => {
    clearOrganization();
    expect(() => organization()).toThrow(
      "No organization context: call loadOrganization() before rendering (main.tsx), or setOrganization(testOrganization()) in a test's setup",
    );
    expect(() => today()).toThrow("No organization context");
  });

  it("is the context set, and today is its today", () => {
    setOrganization(DOJO);
    expect(organization()).toBe(DOJO);
    expect(today()).toBe("2026-11-20");
  });
});

describe("onOrganizationChange", () => {
  it("tells a listener of each new context until it unsubscribes", () => {
    const heard: string[] = [];
    const unsubscribe = onOrganizationChange(() => heard.push(today()));
    setOrganization(DOJO);
    unsubscribe();
    setOrganization({ ...DOJO, today: "2026-11-21" });
    expect(heard).toEqual(["2026-11-20"]);
  });
});

describe("loadOrganization", () => {
  it("takes the page's context without a request", async () => {
    await expect(loadOrganization(pageWith(JSON.stringify(DOJO)))).resolves.toEqual(DOJO);
    expect(today()).toBe("2026-11-20");
  });

  it("asks the server when the page has none", async () => {
    server.use(http.get("/api/organization", () => HttpResponse.json(DOJO)));
    await expect(loadOrganization(pageWith("__APP_CONTEXT__"))).resolves.toEqual(DOJO);
    expect(organization()).toEqual(DOJO);
  });

  it("refuses a malformed answer from the server", async () => {
    server.use(http.get("/api/organization", () => HttpResponse.json({ ...DOJO, today: "" })));
    await expect(loadOrganization(pageWith(null))).rejects.toThrow("GET /api/organization's context has no today");
  });
});

describe("testOrganization", () => {
  it("is a fixed context a test can change", () => {
    expect(testOrganization()).toEqual({
      timeZone: "America/New_York",
      locale: "en-US",
      today: "2026-06-15",
      todayEndsAt: "2026-06-16T04:00:00Z",
      currency: "USD",
      fractionDigits: 2,
    });
    expect(testOrganization({ locale: "fr-FR" }).locale).toBe("fr-FR");
  });
});
