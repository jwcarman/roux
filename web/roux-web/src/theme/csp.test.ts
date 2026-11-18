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

  it("is the attribute's value when the browser hides the property's once parsed", () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="abc123">';
    Object.defineProperty(document.querySelector("meta")!, "nonce", { value: "" });

    expect(cspNonce()).toBe("abc123");
  });

  it("is absent when the meta tag holds none", () => {
    document.head.innerHTML = '<meta property="csp-nonce">';

    expect(cspNonce()).toBeUndefined();
  });
});
