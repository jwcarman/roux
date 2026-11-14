import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";
import { date, email, fieldRules, integer, number, oneOf, phone, text, url } from "./rules";

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

    it("is required", () => {
      expect(fieldRules.get(text())).toEqual({ required: true });
    });

    it("limits the length of the trimmed value", () => {
      expect(messagesOf(text().max(3).safeParse("Anna"))).toEqual(["Must be between 0 and 3 characters"]);
      expect(text().max(3).safeParse(" Ann ")).toEqual({ success: true, data: "Ann" });
      expect(fieldRules.get(text().max(3))).toEqual({ required: true, maxLength: 3 });
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
      expect(fieldRules.get(text().optional())).toEqual({ required: false });
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

    it.each(["555-121", "614-555-CALL", "call me"])("refuses %s", (value) => {
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

    it("refuses empty", () => {
      expect(messagesOf(date().safeParse(""))).toEqual(["Must not be empty"]);
      expect(fieldRules.get(date())).toEqual({ required: true });
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

  describe("number", () => {
    it("accepts a number", () => {
      expect(number().safeParse(1.5)).toEqual({ success: true, data: 1.5 });
    });

    it("refuses unset", () => {
      expect(messagesOf(number().safeParse(undefined))).toEqual(["Must not be empty"]);
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

    it("takes a select's placeholder as input", () => {
      expectTypeOf<z.input<ReturnType<typeof oneOf<typeof statuses>>>>().toEqualTypeOf<"LEAD" | "ACTIVE" | "">();
      expectTypeOf<z.output<ReturnType<typeof oneOf<typeof statuses>>>>().toEqualTypeOf<"LEAD" | "ACTIVE">();
    });
  });
});
