import { describe, expect, it } from "vitest";
import { validationMessage } from "../testing/validationMessages";
import { contract } from "../testing/contracts";
import { z } from "zod";
import { after, date, email, id, money, number, oneOf, PHONE_PATTERN, phone, text, time, url } from "./rules";

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
    ["an unset id", () => id().safeParse(""), "NotNull", {}],
    ["an unset number", () => number().safeParse(undefined), "NotNull", {}],
    ["an unset date", () => date().safeParse(""), "NotNull", {}],
    ["a number under its minimum", () => number().min(5).safeParse(4), "Min", { value: 5 }],
    ["a number over its maximum", () => number().max(5).safeParse(6), "Max", { value: 5 }],
    ["a malformed phone number", () => phone().safeParse("call me"), "Phone", {}],
    ["a date in the future", () => date().notInFuture().safeParse("2999-01-01"), "NotInFuture", {}],
    ["an unset time", () => time().safeParse(""), "NotNull", {}],
    [
      "a time not after another",
      () =>
        after(z.object({ startsAt: time(), endsAt: time() }), { field: "endsAt", other: "startsAt" }).safeParse({
          startsAt: "10:00",
          endsAt: "09:00",
        }),
      "After",
      { other: "starts at" },
    ],
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

// @Phone on the server and phone() here are one rule (contracts/phone.json; PhoneContractTest is the Java side).
describe("phone() is the server's @Phone", () => {
  const fixture = contract<{ pattern: string; message: string; valid: string[]; invalid: string[] }>("phone.json");

  it("has the server's pattern", () => {
    expect(PHONE_PATTERN).toBe(fixture.pattern);
  });

  it.each(fixture.valid)("the pattern accepts %j", (value) => {
    expect(new RegExp(fixture.pattern).test(value)).toBe(true);
    expect(phone().safeParse(value)).toEqual({ success: true, data: value });
  });

  it.each(fixture.invalid)("the pattern refuses %j", (value) => {
    expect(new RegExp(fixture.pattern).test(value)).toBe(false);
  });

  // The rule trims before it checks, so only a value that has nothing to trim shows the pattern's own answer.
  it.each(fixture.invalid.filter((value) => value === value.trim()))("phone() refuses %j", (value) => {
    expect(messageOf(phone().safeParse(value))).toBe(fixture.message);
  });
});

// A malformed LocalTime in a body is a field error with the browser's words (contracts/time.json;
// RuleContractTest is the Java side).
describe("time() is how the server reads a LocalTime", () => {
  const fixture = contract<{ message: string; valid: string[]; invalid: string[] }>("time.json");

  it.each(fixture.valid)("accepts %j", (value) => {
    expect(time().safeParse(value)).toEqual({ success: true, data: value });
  });

  it.each(fixture.invalid)("refuses %j with the server's message", (value) => {
    expect(messageOf(time().safeParse(value))).toBe(fixture.message);
  });
});

// @After on the server and after() here are one rule (contracts/after.json; RuleContractTest is the Java side).
describe("after() is the server's @After", () => {
  interface Case {
    field: string;
    other: string;
    otherLabel?: string;
    message: string;
    valid: [string, string][];
    invalid: [string, string][];
  }
  const fixture = contract<{ time: Case; date: Case }>("after.json");

  function schemaOf(example: Case, rule: typeof time | typeof date) {
    return after(z.object({ [example.other]: rule(), [example.field]: rule() }), {
      field: example.field,
      other: example.other,
      otherLabel: example.otherLabel,
    });
  }

  it.each([
    ["times", fixture.time, time],
    ["dates", fixture.date, date],
  ] as const)("%s: the server's examples, and its message", (_, example, rule) => {
    const schema = schemaOf(example, rule);
    for (const [start, end] of example.valid) {
      expect(schema.safeParse({ [example.other]: start, [example.field]: end }).success).toBe(true);
    }
    for (const [start, end] of example.invalid) {
      const result = schema.safeParse({ [example.other]: start, [example.field]: end });
      expect(result.error?.issues).toHaveLength(1);
      expect(result.error?.issues[0]?.path).toEqual([example.field]);
      expect(result.error?.issues[0]?.message).toBe(example.message);
    }
  });
});

// money() here and roux-money's constraints on the server are one rule (contracts/money.json;
// MoneyContractTest is the Java side). The server never parses typed text: "parse" is the browser's
// alone, and "rules" checks the messages both sides give for the same amount.
describe("money() is the server's money", () => {
  interface ParseCase {
    currency: string;
    input: string;
    minorUnits?: number;
    message?: string;
  }
  interface RuleCase {
    money: { minorUnits: number; currency: string };
    positive: boolean;
    message: string | null;
  }
  const fixture = contract<{ parse: ParseCase[]; rules: RuleCase[] }>("money.json");
  const settingsOf = (currency: string) => ({ currency, fractionDigits: currency === "JPY" ? 0 : 2 });

  it.each(fixture.parse.filter((c) => c.minorUnits !== undefined))("money() reads $input ($currency)", (c) => {
    expect(money(settingsOf(c.currency)).safeParse(c.input)).toEqual({
      success: true,
      data: { minorUnits: c.minorUnits, currency: c.currency },
    });
  });

  it.each(fixture.parse.filter((c) => c.message !== undefined))("money() refuses $input ($currency)", (c) => {
    expect(messageOf(money(settingsOf(c.currency)).safeParse(c.input))).toBe(c.message);
  });

  // The browser's amounts are always in the app's currency, so the other-currency case is the server's.
  it.each(fixture.rules.filter((c) => c.money.currency === "USD"))("gives the server's answer for %j", (c) => {
    const text = (c.money.minorUnits / 100).toFixed(2);
    const rule = c.positive ? money(settingsOf("USD")).positive() : money(settingsOf("USD"));
    const result = rule.safeParse(text);
    expect(result.success ? null : messageOf(result)).toBe(c.message);
  });
});
