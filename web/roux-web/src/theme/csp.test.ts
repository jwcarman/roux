// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cspNonce } from "./csp";
import { inHead } from "../testing/head";

describe("cspNonce", () => {
  it("is the nonce the server put in the page", () => {
    inHead('<meta property="csp-nonce" nonce="abc123">');
    expect(cspNonce()).toBe("abc123");
  });

  it("is absent when the page has none, as under Vite's dev server", () => {
    expect(cspNonce()).toBeUndefined();
  });

  it("is the attribute's value when the browser hides the property's once parsed", () => {
    inHead('<meta property="csp-nonce" nonce="abc123">');
    Object.defineProperty(document.querySelector("meta")!, "nonce", { value: "" });

    expect(cspNonce()).toBe("abc123");
  });

  it("is absent when the meta tag holds none", () => {
    inHead('<meta property="csp-nonce">');

    expect(cspNonce()).toBeUndefined();
  });
});
