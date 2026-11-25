// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { type Cancelled, unwrap, AuthError, type AuthResult } from "./index";

describe("unwrap", () => {
  it("gives the value of a success", () => {
    const result: AuthResult<number, "nope", string> = { ok: true, value: 42 };

    expect(unwrap(result)).toBe(42);
  });

  it("throws a AuthError carrying the failure", () => {
    const result: AuthResult<number, "nope", string> = { ok: false, reason: "nope", status: 409, detail: "taken" };

    expect(() => unwrap(result)).toThrow(AuthError);
    try {
      unwrap(result);
    } catch (e) {
      expect(e).toMatchObject({ reason: "nope", status: 409, detail: "taken" });
    }
  });

  it("throws a AuthError for a cancelled passkey prompt", () => {
    // typed as a passkey call answers, so the compiler sees the whole union, not the literal
    const answer = (): AuthResult<number, "nope", string> | Cancelled => ({
      ok: false,
      reason: "cancelled",
      status: 0,
      detail: undefined,
    });

    expect(() => unwrap(answer())).toThrow(expect.objectContaining({ reason: "cancelled", status: 0 }));
  });
});
