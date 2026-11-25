import { describe, expect, it, vi } from "vitest";
import { listPasskeys, PASSKEY_LABEL_MAX, passkeyLabelError, registerPasskey, removePasskey } from "./passkeys";

const calls = vi.hoisted(() => ({ register: vi.fn(), list: vi.fn(), remove: vi.fn() }));

vi.mock("./auth", () => ({ auth: { me: { passkeys: calls } } }));

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

describe("the passkey calls", () => {
  it("registers under the label, through the server", async () => {
    calls.register.mockResolvedValue("registered");
    await expect(registerPasskey("Phone")).resolves.toBe("registered");
    expect(calls.register).toHaveBeenCalledWith("Phone");
  });

  it("lists the caller's passkeys, through the server", async () => {
    calls.list.mockResolvedValue("listed");
    await expect(listPasskeys()).resolves.toBe("listed");
  });

  it("removes a passkey by its credential id, through the server", async () => {
    calls.remove.mockResolvedValue("removed");
    await expect(removePasskey("c-1")).resolves.toBe("removed");
    expect(calls.remove).toHaveBeenCalledWith("c-1");
  });
});
