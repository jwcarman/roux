import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { validationMessage } from "../testing/validationMessages";
import { date, email, number, oneOf, phone, text, url } from "./rules";

/** The single message a failed parse reports. */
function messageOf(result: { success: boolean; error?: z.ZodError }): string | undefined {
  expect(result.error?.issues).toHaveLength(1);
  return result.error?.issues[0]?.message;
}

// The browser's words for a mistake are the server's (ContributorValidationMessages.properties).
describe("rules say what the server says", () => {
  it.each([
    ["blank text", () => text().safeParse(" "), "NotBlank", {}],
    ["text over its limit", () => text().max(100).safeParse("x".repeat(101)), "Size", { min: 0, max: 100 }],
    ["a malformed email", () => email().safeParse("ann@"), "Email", {}],
    ["an unset choice", () => oneOf(["LEAD"] as const).safeParse(""), "NotNull", {}],
    ["an unset number", () => number().safeParse(undefined), "NotNull", {}],
    ["an unset date", () => date().safeParse(""), "NotNull", {}],
    ["a number under its minimum", () => number().min(5).safeParse(4), "Min", { value: 5 }],
    ["a number over its maximum", () => number().max(5).safeParse(6), "Max", { value: 5 }],
    ["a malformed phone number", () => phone().safeParse("call me"), "Pattern", {}],
    ["a malformed web address", () => url().safeParse("example"), "URL", {}],
  ] as const)("%s", (_, parse, constraint, args) => {
    expect(messageOf(parse())).toBe(validationMessage(constraint, args));
  });

  it("refuses a constraint the server has no message for", () => {
    expect(() => validationMessage("Unknown")).toThrow(
      "jakarta.validation.constraints.Unknown.message is not in runtime",
    );
  });

  it("leaves a placeholder it has no value for", () => {
    expect(validationMessage("Size", { max: 3 })).toBe("Must be between {min} and 3 characters");
  });
});
