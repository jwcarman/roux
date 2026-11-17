import { describe, expect, it } from "vitest";
import { decode, encode } from "./base64url";

describe("base64url", () => {
  it("round-trips bytes that need the url-safe alphabet and no padding", () => {
    const bytes = new Uint8Array([251, 255, 190, 0, 1]);
    const text = encode(bytes.buffer);
    expect(text).toBe("-_--AAE");
    expect(Array.from(new Uint8Array(decode(text)))).toEqual(Array.from(bytes));
  });

  it("decodes unpadded input", () => {
    expect(new TextDecoder().decode(decode("aGk"))).toBe("hi");
  });
});
