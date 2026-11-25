// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { decode, encode } from "./base64url";

describe("base64url", () => {
  it("round-trips every byte value", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);

    expect(Array.from(decode(encode(bytes.buffer)))).toEqual(Array.from(bytes));
  });

  it("uses - and _ and no padding", () => {
    expect(encode(Uint8Array.from([0xfb, 0xff]).buffer)).toBe("-_8");
  });

  it("decodes - and _ without padding", () => {
    expect(Array.from(decode("-_8"))).toEqual([0xfb, 0xff]);
  });

  it("decodes into bytes backed by an ArrayBuffer", () => {
    expect(decode("AAE").buffer).toBeInstanceOf(ArrayBuffer);
  });
});
