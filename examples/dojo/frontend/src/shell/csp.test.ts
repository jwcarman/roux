// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cspNonce } from "./csp";

describe("cspNonce", () => {
  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("is the nonce the server put in the page", () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="abc123">';
    expect(cspNonce()).toBe("abc123");
  });

  it("is absent when the page has none, as under Vite's dev server", () => {
    expect(cspNonce()).toBeUndefined();
  });
});
