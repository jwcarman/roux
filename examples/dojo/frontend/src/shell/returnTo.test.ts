// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { isReturnable, rememberReturn, takeReturn } from "./returnTo";

describe("returnTo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("gives back what was remembered, with its search, once", () => {
    rememberReturn("/classes/c1/check-in?date=2026-03-10");

    expect(takeReturn()).toBe("/classes/c1/check-in?date=2026-03-10");
    expect(takeReturn()).toBeUndefined();
  });

  it("remembers only the last place", () => {
    rememberReturn("/students");
    rememberReturn("/timetable");

    expect(takeReturn()).toBe("/timetable");
  });

  it.each(["/", "//evil.example/steal", "https://evil.example/", "students", "/signin", "/signin/link#token=x", "/api/students", "/who/me", "/\\evil.example", "/students\\..\\evil", ""])(
    "never sends anyone to %j",
    (path) => {
      expect(isReturnable(path)).toBe(false);
    },
  );

  it.each(["/students", "/students/abc", "/timetable", "/classes/c1/check-in?date=2026-03-10", "/signing-days"])(
    "may send someone to %s",
    (path) => {
      expect(isReturnable(path)).toBe(true);
    },
  );

  it("forgets the last place when told of one it may not use", () => {
    rememberReturn("/students");
    rememberReturn("/signin");

    expect(takeReturn()).toBeUndefined();
  });

  it("refuses a stored value that is no longer returnable", () => {
    localStorage.setItem("dojo.returnTo", "//evil.example/");

    expect(takeReturn()).toBeUndefined();
  });

  it("goes quiet when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => rememberReturn("/students")).not.toThrow();
    expect(takeReturn()).toBeUndefined();
  });
});
