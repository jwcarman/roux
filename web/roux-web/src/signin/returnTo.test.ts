// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubLocationReplace } from "../testing/location";
import { renderHook } from "@testing-library/react";
import {
  isReturnable,
  rememberSignInReturn as rememberReturn,
  takeSignInReturn as takeReturn,
  useSignInReturn,
} from "./returnTo";

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

  it("keeps the place under roux.returnTo, and nothing for a place it may not use", () => {
    rememberReturn("/students");
    expect(localStorage.getItem("roux.returnTo")).toBe("/students");

    rememberReturn("/signin");
    expect(localStorage.getItem("roux.returnTo")).toBeNull();
  });

  it("forgets the place once it is taken", () => {
    rememberReturn("/students");
    takeReturn();

    expect(localStorage.getItem("roux.returnTo")).toBeNull();
  });

  it("does not take a sign-in or API page for a path under another", () => {
    expect(isReturnable("/members/signin")).toBe(true);
    expect(isReturnable("/members/api/x")).toBe(true);
    expect(isReturnable("/signin")).toBe(false);
    expect(isReturnable("/api")).toBe(false);
    expect(isReturnable("/api/roux/auth")).toBe(false);
  });

  it("remembers only the last place", () => {
    rememberReturn("/students");
    rememberReturn("/timetable");

    expect(takeReturn()).toBe("/timetable");
  });

  it.each([
    "/",
    "//evil.example/steal",
    "https://evil.example/",
    "students",
    "/signin",
    "/signin/link#token=x",
    "/api/students",
    "/api/roux/auth/me",
    "/\\evil.example",
    "/students\\..\\evil",
    "/\t/evil.example",
    "/students\nx",
    "/students\u007f",
    "/\u0000x",
    "https:",
    "https:/evil.example",
    "",
  ])("never sends anyone to %j", (path) => {
    expect(isReturnable(path)).toBe(false);
  });

  it.each([
    "/students",
    "/students/abc",
    "/timetable",
    "/classes/c1/check-in?date=2026-03-10",
    "/signing-days",
    "/%5c",
    "/%2f",
  ])("may send someone to %s", (path) => {
    expect(isReturnable(path)).toBe(true);
  });

  it("forgets the last place when told of one it may not use", () => {
    rememberReturn("/students");
    rememberReturn("/signin");

    expect(takeReturn()).toBeUndefined();
  });

  it("refuses a stored value that is no longer returnable", () => {
    localStorage.setItem("roux.returnTo", "//evil.example/");

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

  describe("useSignInReturn", () => {
    let replace: ReturnType<typeof stubLocationReplace>;

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function finish() {
      replace = stubLocationReplace();
      return renderHook(() => useSignInReturn()).result.current;
    }

    it("opens the page the visitor asked for, with its search, and forgets it", () => {
      rememberReturn("/classes/c1/check-in?date=2026-03-10");

      finish()();

      expect(replace).toHaveBeenCalledExactlyOnceWith("/classes/c1/check-in?date=2026-03-10");
      expect(takeReturn()).toBeUndefined();
    });

    it("opens Home when nothing was remembered", () => {
      finish()();

      expect(replace).toHaveBeenCalledExactlyOnceWith("/");
    });

    it("is the same function on every render", () => {
      replace = stubLocationReplace();
      const { result, rerender } = renderHook(() => useSignInReturn());
      const first = result.current;

      rerender();

      expect(result.current).toBe(first);
    });
  });
});
