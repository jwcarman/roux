import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { after, date, email, fieldRules, id, integer, money, number, oneOf, phone, text, time, url } from "./rules";

/** The messages a failed parse reports, in order. */
function messagesOf(result: { success: boolean; error?: z.ZodError }): string[] {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("rules", () => {
  it("turns Zod's eval probe off when /form loads", () => {
    expect(z.config().jitless).toBe(true);
  });

  describe("text", () => {
    it("trims", () => {
      expect(text().safeParse("  Ann ")).toEqual({ success: true, data: "Ann" });
    });

    it("refuses blank", () => {
      expect(messagesOf(text().safeParse("   "))).toEqual(["Must not be blank"]);
    });

    it("is required, with no length limit", () => {
      expect(fieldRules.get(text())).toStrictEqual({ required: true });
    });

    it("limits the length of the trimmed value", () => {
      expect(messagesOf(text().max(3).safeParse("Anna"))).toEqual(["Must be between 0 and 3 characters"]);
      expect(text().max(3).safeParse(" Ann ")).toEqual({ success: true, data: "Ann" });
      expect(fieldRules.get(text().max(3))).toEqual({ required: true, maxLength: 3 });
    });

    it("reports only blank for a blank value, without running the schema's refinements", () => {
      const long = text().refine((value) => value.length > 3, { error: "Too short" });
      expect(messagesOf(long.safeParse(""))).toEqual(["Must not be blank"]);
      const matching = z
        .object({ password: text(), confirm: text() })
        .refine((v) => v.password === v.confirm, { path: ["confirm"], error: "Must match" });
      expect(messagesOf(matching.safeParse({ password: "", confirm: "secret" }))).toEqual(["Must not be blank"]);
    });

    it("reports only blank for a blank value with a limit", () => {
      expect(messagesOf(text().max(3).safeParse(""))).toEqual(["Must not be blank"]);
    });

    it("turns blank into null when optional", () => {
      expect(text().max(3).optional().parse("  ")).toBeNull();
      expect(text().optional().parse(" Ann ")).toBe("Ann");
      expect(messagesOf(text().optional().max(3).safeParse("Anna"))).toEqual(["Must be between 0 and 3 characters"]);
    });

    it("registers either order the same", () => {
      expect(fieldRules.get(text().max(100).optional())).toEqual({ required: false, maxLength: 100 });
      expect(fieldRules.get(text().optional().max(100))).toEqual({ required: false, maxLength: 100 });
      expect(fieldRules.get(text().optional())).toStrictEqual({ required: false });
    });

    it("keeps the last limit and stays optional", () => {
      expect(fieldRules.get(text().max(5).max(2))).toEqual({ required: true, maxLength: 2 });
      expect(fieldRules.get(text().optional().optional())).toEqual({ required: false });
    });

    it("types its input and output", () => {
      expectTypeOf<z.input<ReturnType<typeof text>>>().toEqualTypeOf<string>();
      expectTypeOf<z.output<ReturnType<typeof text>>>().toEqualTypeOf<string>();
      const optional = text().max(100).optional();
      expectTypeOf<z.input<typeof optional>>().toEqualTypeOf<string>();
      expectTypeOf(optional.parse).returns.toEqualTypeOf<string | null>();
      expectTypeOf(text().optional().max(100).parse).returns.toEqualTypeOf<string | null>();
    });

    it("sits in an object schema, registered as the shape's entry", () => {
      const schema = z.object({ name: text().max(100), nickname: text().optional() });
      expect(schema.parse({ name: " Ann ", nickname: " " })).toEqual({ name: "Ann", nickname: null });
      expect(fieldRules.get(schema.shape.name)).toEqual({ required: true, maxLength: 100 });
      expect(fieldRules.get(schema.shape.nickname)).toEqual({ required: false });
      expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<{ name: string; nickname: string | null }>();
    });
  });

  describe("email", () => {
    it("accepts an address, trimmed", () => {
      expect(email().safeParse(" ann@example.com ")).toEqual({ success: true, data: "ann@example.com" });
    });

    it("refuses a malformed address", () => {
      expect(messagesOf(email().safeParse("ann@"))).toEqual(["Must be a valid email address"]);
    });

    it("reports only blank for a blank value", () => {
      expect(messagesOf(email().safeParse(" "))).toEqual(["Must not be blank"]);
    });

    it("lets an optional one be empty, but not malformed", () => {
      expect(email().optional().parse("")).toBeNull();
      expect(messagesOf(email().optional().safeParse("ann"))).toEqual(["Must be a valid email address"]);
      expect(messagesOf(email().max(5).optional().safeParse("ann@example.com"))).toEqual([
        "Must be between 0 and 5 characters",
      ]);
    });
  });

  describe("url", () => {
    it("accepts a web address", () => {
      expect(url().safeParse(" https://example.com/a ")).toEqual({ success: true, data: "https://example.com/a" });
      expect(url().safeParse("http://example.com").success).toBe(true);
    });

    it.each(["example", "ftp://example.com", "mailto:ann@example.com", "https://"])("refuses %s", (value) => {
      expect(messagesOf(url().safeParse(value))).toEqual(["Must be a valid web address"]);
    });

    it("lets an optional one be empty", () => {
      expect(url().optional().parse(" ")).toBeNull();
    });
  });

  describe("phone", () => {
    it.each(["(614) 555-1212", "+1 614.555.1212", "5551212"])("accepts %s", (value) => {
      expect(phone().safeParse(value)).toEqual({ success: true, data: value });
    });

    it.each(["555-121", "614-555-CALL", "call me", "call 5551212", "5551212 call"])("refuses %s", (value) => {
      expect(messagesOf(phone().safeParse(value))).toEqual(["Is not in the expected format"]);
    });

    it("lets an optional one be empty", () => {
      expect(phone().optional().parse("")).toBeNull();
    });
  });

  describe("date", () => {
    it("accepts a date input's value", () => {
      expect(date().safeParse("2026-11-14")).toEqual({ success: true, data: "2026-11-14" });
    });

    it("takes a date in the future unless told not to", () => {
      expect(date().safeParse("2999-01-01")).toEqual({ success: true, data: "2999-01-01" });
      expect(date().optional().safeParse("2999-01-01")).toEqual({ success: true, data: "2999-01-01" });
    });

    it("refuses empty", () => {
      expect(messagesOf(date().safeParse(""))).toEqual(["Must not be empty"]);
      expect(fieldRules.get(date())).toEqual({ required: true });
    });

    it("reports only empty for an empty date, without running the schema's refinements", () => {
      const range = z
        .object({ from: date(), to: date() })
        .refine((v) => v.from <= v.to, { path: ["to"], error: "To before from" });
      expect(messagesOf(range.safeParse({ from: "2026-11-14", to: "" }))).toEqual(["Must not be empty"]);
    });

    it("refuses something that is not a date", () => {
      expect(messagesOf(date().safeParse("11/14/2026"))).toEqual(["Is not in the expected format"]);
    });

    it("turns empty into null when optional", () => {
      expect(date().optional().parse("")).toBeNull();
      expect(date().optional().parse("2026-11-14")).toBe("2026-11-14");
      expect(messagesOf(date().optional().safeParse("2026-13-01"))).toEqual(["Is not in the expected format"]);
      expect(fieldRules.get(date().optional())).toEqual({ required: false });
      expect(fieldRules.get(date().optional().optional())).toEqual({ required: false });
    });

    it("types its input and output", () => {
      expectTypeOf<z.input<ReturnType<typeof date>>>().toEqualTypeOf<string>();
      expectTypeOf<z.output<ReturnType<typeof date>>>().toEqualTypeOf<string>();
      const optional = date().optional();
      expectTypeOf<z.input<typeof optional>>().toEqualTypeOf<string>();
      expectTypeOf(optional.parse).returns.toEqualTypeOf<string | null>();
    });
  });

  describe("time", () => {
    it("accepts a time input's value, and the server's seconds", () => {
      expect(time().safeParse("18:30")).toEqual({ success: true, data: "18:30" });
      expect(time().safeParse("18:30:00")).toEqual({ success: true, data: "18:30:00" });
    });

    it("refuses empty, as required", () => {
      expect(messagesOf(time().safeParse(""))).toEqual(["Must not be empty"]);
      expect(fieldRules.get(time())).toStrictEqual({ required: true });
    });

    it("refuses what is not a time, reporting only that", () => {
      expect(messagesOf(time().safeParse("6pm"))).toEqual(["Is not in the expected format"]);
      expect(messagesOf(time().safeParse("24:00"))).toEqual(["Is not in the expected format"]);
    });

    it("lets an optional one be empty, which gives null, but not malformed", () => {
      expect(time().optional().parse("")).toBeNull();
      expect(time().optional().parse("09:00")).toBe("09:00");
      expect(messagesOf(time().optional().safeParse("late"))).toEqual(["Is not in the expected format"]);
      expect(fieldRules.get(time().optional())).toStrictEqual({ required: false });
      expect(fieldRules.get(time().optional().optional())).toStrictEqual({ required: false });
    });

    it("types its input and output", () => {
      expectTypeOf<z.input<ReturnType<typeof time>>>().toEqualTypeOf<string>();
      expectTypeOf(time().optional().parse).returns.toEqualTypeOf<string | null>();
      expectTypeOf(time().parse).returns.toEqualTypeOf<string>();
    });
  });

  describe("date().notInFuture()", () => {
    // Local time: the browser's own today is the 5th of January, 2026, though UTC may already be the 6th.
    const at = (year: number, month: number, day: number, hours: number) =>
      vi.setSystemTime(new Date(year, month - 1, day, hours, 30));

    afterEach(() => {
      vi.useRealTimers();
    });

    it("accepts the browser's today and every earlier day", () => {
      vi.useFakeTimers();
      at(2026, 1, 5, 23);
      for (const value of ["2026-01-05", "2026-01-04", "2025-12-31", "1990-02-03"]) {
        expect(date().notInFuture().safeParse(value)).toEqual({ success: true, data: value });
      }
    });

    it("refuses tomorrow and later, as the server's words say", () => {
      vi.useFakeTimers();
      at(2026, 1, 5, 0);
      for (const value of ["2026-01-06", "2026-02-01", "2027-01-01"]) {
        expect(messagesOf(date().notInFuture().safeParse(value))).toEqual(["Must not be in the future"]);
      }
    });

    it("reads today when it parses, not when the rule was built", () => {
      vi.useFakeTimers();
      at(2026, 1, 5, 12);
      const rule = date().notInFuture();
      at(2026, 1, 6, 12);
      expect(rule.safeParse("2026-01-06").success).toBe(true);
    });

    it("pads a month and a day to two digits", () => {
      vi.useFakeTimers();
      at(2026, 3, 7, 12);
      expect(date().notInFuture().safeParse("2026-03-07").success).toBe(true);
      expect(date().notInFuture().safeParse("2026-03-08").success).toBe(false);
    });

    it("reports a value that is not a date only as that, and empty only as empty", () => {
      expect(messagesOf(date().notInFuture().safeParse("2026-13-01"))).toEqual(["Is not in the expected format"]);
      expect(messagesOf(date().notInFuture().safeParse(""))).toEqual(["Must not be empty"]);
    });

    it("lets an optional one be empty, in either order", () => {
      expect(date().notInFuture().optional().parse("")).toBeNull();
      expect(date().optional().notInFuture().parse("")).toBeNull();
      expect(date().optional().notInFuture().parse("2000-01-01")).toBe("2000-01-01");
      expect(messagesOf(date().optional().notInFuture().safeParse("2999-01-01"))).toEqual([
        "Must not be in the future",
      ]);
      expect(messagesOf(date().notInFuture().optional().safeParse("2999-01-01"))).toEqual([
        "Must not be in the future",
      ]);
    });

    it("keeps the field's rule", () => {
      expect(fieldRules.get(date().notInFuture())).toEqual({ required: true });
      expect(fieldRules.get(date().notInFuture().optional())).toEqual({ required: false });
      expect(fieldRules.get(date().notInFuture().notInFuture())).toEqual({ required: true });
    });

    it("keeps its types", () => {
      const required = date().notInFuture();
      expectTypeOf(required.parse).returns.toEqualTypeOf<string>();
      const optional = date().notInFuture().optional();
      expectTypeOf(optional.parse).returns.toEqualTypeOf<string | null>();
      expectTypeOf(date().optional().notInFuture().parse).returns.toEqualTypeOf<string | null>();
    });
  });

  describe("number", () => {
    it("accepts a number", () => {
      expect(number().safeParse(1.5)).toEqual({ success: true, data: 1.5 });
    });

    it("refuses unset", () => {
      expect(messagesOf(number().safeParse(undefined))).toEqual(["Must not be empty"]);
      expect(messagesOf(number().safeParse(Number.NaN))).toEqual(["Must not be empty"]);
      expect(fieldRules.get(number())).toEqual({ required: true });
    });

    it("keeps to its bounds", () => {
      expect(messagesOf(number().min(5).safeParse(4))).toEqual(["Must be at least 5"]);
      expect(messagesOf(number().max(5).safeParse(6))).toEqual(["Must be at most 5"]);
      expect(number().min(5).max(5).safeParse(5)).toEqual({ success: true, data: 5 });
      expect(messagesOf(number().max(5).min(1).safeParse(undefined))).toEqual(["Must not be empty"]);
    });

    it("turns unset into null when optional", () => {
      expect(number().optional().parse(undefined)).toBeNull();
      expect(number().min(1).optional().parse(2)).toBe(2);
      expect(messagesOf(number().optional().min(1).safeParse(0))).toEqual(["Must be at least 1"]);
      expect(messagesOf(number().optional().max(5).safeParse(6))).toEqual(["Must be at most 5"]);
      expect(fieldRules.get(number().min(1).optional())).toEqual({ required: false });
      expect(fieldRules.get(number().optional().optional())).toEqual({ required: false });
    });

    it("types its input and output", () => {
      expectTypeOf<z.input<ReturnType<typeof number>>>().toEqualTypeOf<number | undefined>();
      expectTypeOf<z.output<ReturnType<typeof number>>>().toEqualTypeOf<number>();
      const optional = number().min(1).optional();
      expectTypeOf<z.input<typeof optional>>().toEqualTypeOf<number | undefined>();
      expectTypeOf(optional.parse).returns.toEqualTypeOf<number | null>();
    });
  });

  describe("integer", () => {
    it("refuses a fraction", () => {
      expect(messagesOf(integer().min(1).safeParse(1.5))).toEqual(["Must be a whole number"]);
      expect(messagesOf(integer().optional().safeParse(0.5))).toEqual(["Must be a whole number"]);
    });

    it("accepts a whole number", () => {
      expect(integer().max(3).safeParse(3)).toEqual({ success: true, data: 3 });
      expect(messagesOf(integer().safeParse(undefined))).toEqual(["Must not be empty"]);
    });
  });

  describe("oneOf", () => {
    const statuses = ["LEAD", "ACTIVE"] as const;

    it("accepts one of the values", () => {
      expect(oneOf(statuses).safeParse("ACTIVE")).toEqual({ success: true, data: "ACTIVE" });
    });

    it.each(["", "GONE", undefined])("refuses %s", (value) => {
      expect(messagesOf(oneOf(statuses).safeParse(value))).toEqual(["Must not be empty"]);
    });

    it("is required", () => {
      expect(fieldRules.get(oneOf(statuses))).toEqual({ required: true });
    });

    it("takes the placeholder in, then refuses it as no value chosen, naming the values", () => {
      expect(oneOf(statuses).safeParse("").error?.issues).toMatchObject([
        { code: "invalid_value", values: ["LEAD", "ACTIVE"], message: "Must not be empty" },
      ]);
    });

    it("takes a select's placeholder as input", () => {
      expectTypeOf<z.input<ReturnType<typeof oneOf<typeof statuses>>>>().toEqualTypeOf<"LEAD" | "ACTIVE" | "">();
      expectTypeOf<z.output<ReturnType<typeof oneOf<typeof statuses>>>>().toEqualTypeOf<"LEAD" | "ACTIVE">();
    });
  });

  describe("oneOf(...).optional()", () => {
    const statuses = ["LEAD", "ACTIVE"] as const;

    it("takes the placeholder as no choice, which is null", () => {
      expect(oneOf(statuses).optional().parse("")).toBeNull();
      expect(oneOf(statuses).optional().optional().parse("")).toBeNull();
      expect(oneOf(statuses).optional().parse("LEAD")).toBe("LEAD");
    });

    it("still refuses a value that is not one of them", () => {
      expect(messagesOf(oneOf(statuses).optional().safeParse("GONE"))).toEqual(["Must not be empty"]);
    });

    it("is not required", () => {
      expect(fieldRules.get(oneOf(statuses).optional())).toStrictEqual({ required: false });
      expect(fieldRules.get(oneOf(statuses).optional().optional())).toStrictEqual({ required: false });
      expect(fieldRules.get(z.object({ status: oneOf(statuses).optional() }).shape.status)).toStrictEqual({
        required: false,
      });
    });

    it("types the placeholder as input and null as output", () => {
      const optional = oneOf(statuses).optional();
      expectTypeOf<z.input<typeof optional>>().toEqualTypeOf<"LEAD" | "ACTIVE" | "">();
      expectTypeOf(optional.parse).returns.toEqualTypeOf<"LEAD" | "ACTIVE" | null>();
    });
  });

  describe("id().optional()", () => {
    it("takes the placeholder as no choice, which is null", () => {
      expect(id().optional().parse("")).toBeNull();
      expect(id().optional().optional().parse("")).toBeNull();
      expect(id().optional().parse("0b9f6c0e-4d3a-4f6e-9a57-1c2d3e4f5a6b")).toBe(
        "0b9f6c0e-4d3a-4f6e-9a57-1c2d3e4f5a6b",
      );
    });

    it("is not required, and types its output as string or null", () => {
      const schema = z.object({ instructorId: id().optional() });
      expect(fieldRules.get(schema.shape.instructorId)).toStrictEqual({ required: false });
      expect(fieldRules.get(id().optional().optional())).toStrictEqual({ required: false });
      expectTypeOf<z.input<typeof schema>>().toEqualTypeOf<{ instructorId: string }>();
      expectTypeOf<z.output<typeof schema>>().toEqualTypeOf<{ instructorId: string | null }>();
    });
  });

  describe("id", () => {
    it("accepts a chosen id", () => {
      expect(id().safeParse("0b9f6c0e-4d3a-4f6e-9a57-1c2d3e4f5a6b")).toEqual({
        success: true,
        data: "0b9f6c0e-4d3a-4f6e-9a57-1c2d3e4f5a6b",
      });
    });

    it.each(["", undefined])("refuses %s as no choice made", (value) => {
      expect(messagesOf(id().safeParse(value))).toEqual(["Must not be empty"]);
    });

    it("is required, and registered as the shape's entry", () => {
      const schema = z.object({ rankId: id() });
      expect(fieldRules.get(schema.shape.rankId)).toStrictEqual({ required: true });
    });

    it("takes a select's placeholder as input", () => {
      expectTypeOf<z.input<ReturnType<typeof id>>>().toEqualTypeOf<string>();
      expectTypeOf<z.output<ReturnType<typeof id>>>().toEqualTypeOf<string>();
    });
  });

  describe("after", () => {
    const shifts = after(z.object({ startsAt: time(), endsAt: time() }), { field: "endsAt", other: "startsAt" });

    function issuesOf(result: { success: boolean; error?: z.ZodError }) {
      return result.error?.issues.map((issue) => ({ path: issue.path, message: issue.message })) ?? [];
    }

    it("accepts a later time, comparing times and not text", () => {
      expect(shifts.safeParse({ startsAt: "09:00", endsAt: "10:00" }).success).toBe(true);
      expect(shifts.safeParse({ startsAt: "09:00:00", endsAt: "09:00:30" }).success).toBe(true);
    });

    it("puts the message, in words, under the later field", () => {
      expect(issuesOf(shifts.safeParse({ startsAt: "10:00", endsAt: "09:00" }))).toEqual([
        { path: ["endsAt"], message: "Must be after starts at" },
      ]);
    });

    it("says an equal one is not after", () => {
      expect(shifts.safeParse({ startsAt: "09:00", endsAt: "09:00:00" }).success).toBe(false);
    });

    it("leaves an empty or invalid field to its own rule", () => {
      expect(messagesOf(shifts.safeParse({ startsAt: "", endsAt: "09:00" }))).toEqual(["Must not be empty"]);
      expect(messagesOf(shifts.safeParse({ startsAt: "10:00", endsAt: "late" }))).toEqual([
        "Is not in the expected format",
      ]);
      const optional = after(z.object({ from: date().optional(), to: date().optional() }), {
        field: "to",
        other: "from",
      });
      expect(optional.safeParse({ from: "", to: "2026-01-01" }).success).toBe(true);
      expect(optional.safeParse({ from: "2026-01-01", to: "" }).success).toBe(true);
    });

    it("compares dates, date-times and numbers, and takes a label", () => {
      const stay = after(z.object({ start: date(), end: date() }), {
        field: "end",
        other: "start",
        otherLabel: "the first day",
      });
      expect(messagesOf(stay.safeParse({ start: "2026-03-02", end: "2026-03-01" }))).toEqual([
        "Must be after the first day",
      ]);
      expect(stay.safeParse({ start: "2026-03-01", end: "2026-03-02" }).success).toBe(true);
      const range = after(z.object({ min: number(), max: number() }), { field: "max", other: "min" });
      expect(messagesOf(range.safeParse({ min: 2, max: 1 }))).toEqual(["Must be after min"]);
      expect(range.safeParse({ min: 1, max: 2 }).success).toBe(true);
      const at = after(z.object({ from: z.string(), to: z.string() }), { field: "to", other: "from" });
      expect(at.safeParse({ from: "2026-03-01T10:00", to: "2026-03-01T09:00" }).success).toBe(false);
      expect(at.safeParse({ from: "2026-03-01T10:00", to: "2026-03-01T10:01" }).success).toBe(true);
    });

    it("words a camelCase name, and a name with digits", () => {
      const schema = after(z.object({ line2Start: number(), lineEnd: number() }), {
        field: "lineEnd",
        other: "line2Start",
      });
      expect(messagesOf(schema.safeParse({ line2Start: 5, lineEnd: 1 }))).toEqual(["Must be after line2 start"]);
    });

    it("keeps the fields' rules, and takes only the schema's own fields", () => {
      expect(fieldRules.get(shifts.shape.endsAt)).toEqual({ required: true });
      // @ts-expect-error `finish` is not a field of the schema
      after(z.object({ startsAt: time() }), { field: "finish", other: "startsAt" });
    });
  });
});

describe("money()", () => {
  const usd = { currency: "USD", fractionDigits: 2 };

  it("counts decimal places by the currency's digits", () => {
    const one = money({ currency: "USD", fractionDigits: 1 }).safeParse("1.55");
    const three = money({ currency: "KWD", fractionDigits: 3 }).safeParse("1.5555");
    expect(one.error?.issues[0]?.message).toBe("Must have at most 1 decimal place");
    expect(three.error?.issues[0]?.message).toBe("Must have at most 3 decimal places");
    expect(money({ currency: "KWD", fractionDigits: 3 }).safeParse("1.5")).toEqual({
      success: true,
      data: { minorUnits: 1500, currency: "KWD" },
    });
  });

  it("reads a symbol followed by a space", () => {
    expect(money(usd).safeParse("$ 150").data).toEqual({ minorUnits: 15000, currency: "USD" });
  });

  it("takes only its own currency's symbol", () => {
    expect(money({ currency: "EUR", fractionDigits: 2 }).safeParse("€150").data).toEqual({
      minorUnits: 15000,
      currency: "EUR",
    });
    expect(money({ currency: "EUR", fractionDigits: 2 }).safeParse("$150").error?.issues[0]?.message).toBe(
      "Must be an amount",
    );
  });

  it("treats blank as empty", () => {
    expect(money(usd).safeParse("   ").error?.issues[0]?.message).toBe("Must not be empty");
    expect(money(usd).optional().safeParse("   ")).toEqual({ success: true, data: null });
    expect(money(usd).optional().safeParse("")).toEqual({ success: true, data: null });
  });

  it("keeps an optional amount's checks", () => {
    expect(money(usd).optional().positive().safeParse("0").error?.issues[0]?.message).toBe("Must be more than 0");
    expect(money(usd).optional().safeParse("2.5").data).toEqual({ minorUnits: 250, currency: "USD" });
  });

  it("marks the field required unless optional", () => {
    expect(fieldRules.get(money(usd))).toEqual({ required: true });
    expect(fieldRules.get(money(usd).optional())).toEqual({ required: false });
  });

  it("reports each refusal as a custom issue on the field", () => {
    for (const [rule, text] of [
      [money(usd), ""],
      [money(usd), "abc"],
      [money(usd).positive(), "0"],
    ] as const) {
      expect(rule.safeParse(text).error?.issues[0]?.code).toBe("custom");
    }
  });
});
