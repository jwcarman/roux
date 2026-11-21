import { describe, expect, it } from "vitest";
import { PASSKEY_LABEL_MAX, passkeyLabelError } from "./passkeys";

describe("passkeyLabelError", () => {
  it("takes a label of 1 to 64 characters", () => {
    expect(passkeyLabelError("Work laptop")).toBeUndefined();
    expect(passkeyLabelError("x")).toBeUndefined();
    expect(passkeyLabelError("x".repeat(PASSKEY_LABEL_MAX))).toBeUndefined();
  });

  it("refuses a blank label", () => {
    expect(passkeyLabelError("")).toBe("Name this passkey, such as the device it is on");
    expect(passkeyLabelError("   ")).toBe("Name this passkey, such as the device it is on");
  });

  it("refuses a label over 64 characters, counted after trimming", () => {
    expect(passkeyLabelError("x".repeat(PASSKEY_LABEL_MAX + 1))).toBe("Must be at most 64 characters");
    expect(passkeyLabelError(` ${"x".repeat(PASSKEY_LABEL_MAX)} `)).toBeUndefined();
  });

  it("refuses a control character", () => {
    expect(passkeyLabelError("Work\u0007laptop")).toBe("Must not contain control characters");
    expect(passkeyLabelError("Work\nlaptop")).toBe("Must not contain control characters");
  });
});
