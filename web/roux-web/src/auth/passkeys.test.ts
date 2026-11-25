// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encode } from "./base64url";
import { createAuthClient } from "./index";
import { at, server, setCsrfCookie } from "./testing";

const bytes = (...values: number[]) => Uint8Array.from(values).buffer;

const CREATION_OPTIONS = {
  challenge: encode(bytes(1, 2, 3)),
  rp: { id: "app.test", name: "App" },
  user: { id: encode(bytes(9, 9)), name: "alice", displayName: "Alice" },
  pubKeyCredParams: [{ type: "public-key", alg: -7 }],
  excludeCredentials: [{ id: encode(bytes(7)), type: "public-key", transports: ["internal"] }],
};

const REQUEST_OPTIONS = {
  challenge: encode(bytes(4, 5)),
  rpId: "app.test",
  allowCredentials: [{ id: encode(bytes(8)), type: "public-key" }],
};

/** What navigator.credentials.create gives: a new passkey's attestation. */
const created = {
  id: "cred-1",
  rawId: bytes(1, 1),
  type: "public-key",
  authenticatorAttachment: "platform",
  getClientExtensionResults: () => ({ credProps: { rk: true } }),
  response: {
    attestationObject: bytes(2, 2),
    clientDataJSON: bytes(3, 3),
    getTransports: () => ["internal", "hybrid"],
  },
};

/** What navigator.credentials.get gives: an assertion. */
const asserted = {
  id: "cred-1",
  rawId: bytes(1, 1),
  type: "public-key",
  authenticatorAttachment: "platform",
  getClientExtensionResults: () => ({}),
  response: {
    authenticatorData: bytes(4, 4),
    clientDataJSON: bytes(5, 5),
    signature: bytes(6, 6),
    userHandle: bytes(9, 9),
  },
};

const create = vi.fn<(options: CredentialCreationOptions) => Promise<unknown>>();
const get = vi.fn<(options: CredentialRequestOptions) => Promise<unknown>>();

beforeEach(() => {
  setCsrfCookie("t");
  create.mockReset();
  get.mockReset();
  Object.defineProperty(navigator, "credentials", { value: { create, get }, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(window, "PublicKeyCredential");
});

function refused(status: number, code?: string): HttpResponse<null> {
  return new HttpResponse(null, { status, headers: code ? { "Roux-Error": code } : {} });
}

describe("passkeys.supported", () => {
  it("is false without WebAuthn", () => {
    expect(createAuthClient().passkeys.supported()).toBe(false);
  });

  it("is true with WebAuthn", () => {
    Object.defineProperty(window, "PublicKeyCredential", {
      value: function PublicKeyCredential() {},
      configurable: true,
    });

    expect(createAuthClient().passkeys.supported()).toBe(true);
  });
});

describe("me.passkeys.register", () => {
  it("turns roux's options into bytes, and the new passkey back into roux's JSON", async () => {
    let body: unknown;
    server.use(
      http.post(at("/api/roux/auth/me/passkeys/options"), () => HttpResponse.json(CREATION_OPTIONS)),
      http.post(at("/api/roux/auth/me/passkeys"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ success: true });
      }),
    );
    create.mockResolvedValue(created);

    await expect(createAuthClient().me.passkeys.register("Laptop")).resolves.toEqual({ ok: true, value: undefined });

    const publicKey = create.mock.calls[0]?.[0].publicKey;
    expect(Array.from(new Uint8Array(publicKey?.challenge as ArrayBuffer))).toEqual([1, 2, 3]);
    expect(Array.from(new Uint8Array(publicKey?.user.id as ArrayBuffer))).toEqual([9, 9]);
    expect(Array.from(new Uint8Array(publicKey?.excludeCredentials?.[0]?.id as ArrayBuffer))).toEqual([7]);
    expect(publicKey?.rp).toEqual({ id: "app.test", name: "App" });
    expect(body).toEqual({
      publicKey: {
        credential: {
          id: "cred-1",
          rawId: encode(bytes(1, 1)),
          type: "public-key",
          response: {
            attestationObject: encode(bytes(2, 2)),
            clientDataJSON: encode(bytes(3, 3)),
            transports: ["internal", "hybrid"],
          },
          clientExtensionResults: { credProps: { rk: true } },
          authenticatorAttachment: "platform",
        },
        label: "Laptop",
      },
    });
  });

  it("asks nothing of the browser when who needs a recent sign-in", async () => {
    server.use(http.post(at("/api/roux/auth/me/passkeys/options"), () => refused(401, "reauthentication-required")));

    await expect(createAuthClient().me.passkeys.register("Laptop")).resolves.toMatchObject({
      ok: false,
      reason: "reauthentication-required",
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("answers signed-out when the session ends before who has the passkey", async () => {
    server.use(
      http.post(at("/api/roux/auth/me/passkeys/options"), () => HttpResponse.json(CREATION_OPTIONS)),
      http.post(at("/api/roux/auth/me/passkeys"), () => refused(401, "not-signed-in")),
    );
    create.mockResolvedValue(created);

    await expect(createAuthClient().me.passkeys.register("Laptop")).resolves.toMatchObject({
      ok: false,
      reason: "signed-out",
    });
  });

  it("answers rejected when who refuses the passkey", async () => {
    server.use(
      http.post(at("/api/roux/auth/me/passkeys/options"), () => HttpResponse.json(CREATION_OPTIONS)),
      http.post(at("/api/roux/auth/me/passkeys"), () => refused(400, "invalid-passkey-registration")),
    );
    create.mockResolvedValue(created);

    await expect(createAuthClient().me.passkeys.register("Laptop")).resolves.toMatchObject({
      ok: false,
      reason: "rejected",
    });
  });

  it("answers cancelled when the person dismisses the prompt", async () => {
    server.use(http.post(at("/api/roux/auth/me/passkeys/options"), () => HttpResponse.json(CREATION_OPTIONS)));
    create.mockRejectedValue(new DOMException("dismissed", "NotAllowedError"));

    await expect(createAuthClient().me.passkeys.register("Laptop")).resolves.toEqual({
      ok: false,
      reason: "cancelled",
      status: 0,
      detail: undefined,
    });
  });

  it("answers already-registered when this device holds a passkey for the account", async () => {
    server.use(http.post(at("/api/roux/auth/me/passkeys/options"), () => HttpResponse.json(CREATION_OPTIONS)));
    create.mockRejectedValue(new DOMException("excluded", "InvalidStateError"));

    await expect(createAuthClient().me.passkeys.register("Laptop")).resolves.toEqual({
      ok: false,
      reason: "already-registered",
      status: 0,
      detail: undefined,
    });
  });

  it("lets any other browser failure through", async () => {
    server.use(http.post(at("/api/roux/auth/me/passkeys/options"), () => HttpResponse.json(CREATION_OPTIONS)));
    const failure = new DOMException("wrong origin", "SecurityError");
    create.mockRejectedValue(failure);

    await expect(createAuthClient().me.passkeys.register("Laptop")).rejects.toBe(failure);
  });
});

describe("passkeys.signIn", () => {
  it("fetches the CSRF cookie first, then signs in with the assertion", async () => {
    document.cookie = "XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    let body: unknown;
    server.use(
      http.get(at("/api/roux/auth/me"), () => {
        setCsrfCookie("fresh");
        return refused(401);
      }),
      http.post(at("/api/roux/auth/passkey/sign-in/options"), () => HttpResponse.json(REQUEST_OPTIONS)),
      http.post(at("/api/roux/auth/passkey/sign-in"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ identityId: "i1" });
      }),
    );
    get.mockResolvedValue(asserted);

    await expect(createAuthClient().passkeys.signIn()).resolves.toEqual({ ok: true, value: { identityId: "i1" } });

    const publicKey = get.mock.calls[0]?.[0].publicKey;
    expect(Array.from(new Uint8Array(publicKey?.challenge as ArrayBuffer))).toEqual([4, 5]);
    expect(Array.from(new Uint8Array(publicKey?.allowCredentials?.[0]?.id as ArrayBuffer))).toEqual([8]);
    expect(body).toEqual({
      id: "cred-1",
      rawId: encode(bytes(1, 1)),
      type: "public-key",
      response: {
        authenticatorData: encode(bytes(4, 4)),
        clientDataJSON: encode(bytes(5, 5)),
        signature: encode(bytes(6, 6)),
        userHandle: encode(bytes(9, 9)),
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    });
  });

  it("answers rejected on a 401", async () => {
    server.use(
      http.post(at("/api/roux/auth/passkey/sign-in/options"), () => HttpResponse.json(REQUEST_OPTIONS)),
      http.post(at("/api/roux/auth/passkey/sign-in"), () => refused(401, "sign-in-failed")),
    );
    get.mockResolvedValue(asserted);

    await expect(createAuthClient().passkeys.signIn()).resolves.toMatchObject({ ok: false, reason: "rejected" });
  });

  it("answers cancelled when the person dismisses the prompt", async () => {
    server.use(http.post(at("/api/roux/auth/passkey/sign-in/options"), () => HttpResponse.json(REQUEST_OPTIONS)));
    get.mockRejectedValue(new DOMException("dismissed", "NotAllowedError"));

    await expect(createAuthClient().passkeys.signIn()).resolves.toMatchObject({ ok: false, reason: "cancelled" });
  });

  it("lets any other browser failure through", async () => {
    server.use(http.post(at("/api/roux/auth/passkey/sign-in/options"), () => HttpResponse.json(REQUEST_OPTIONS)));
    const failure = new DOMException("wrong origin", "SecurityError");
    get.mockRejectedValue(failure);

    await expect(createAuthClient().passkeys.signIn()).rejects.toBe(failure);
  });
});

describe("me.passkeys.list", () => {
  it("answers the passkeys", async () => {
    const passkey = { credentialId: "cred-1", label: "Laptop", createdAt: "2026-11-16T10:00:00Z", lastUsedAt: null };
    server.use(http.get(at("/api/roux/auth/me/passkeys"), () => HttpResponse.json([passkey])));

    await expect(createAuthClient().me.passkeys.list()).resolves.toEqual({ ok: true, value: [passkey] });
  });

  it("answers signed-out on a 401", async () => {
    server.use(http.get(at("/api/roux/auth/me/passkeys"), () => refused(401, "not-signed-in")));

    await expect(createAuthClient().me.passkeys.list()).resolves.toMatchObject({ ok: false, reason: "signed-out" });
  });
});

describe("me.passkeys.remove", () => {
  it("removes by the escaped credential id", async () => {
    server.use(http.delete(at("/api/roux/auth/me/passkeys/a%2Fb"), () => new HttpResponse(null, { status: 204 })));

    await expect(createAuthClient().me.passkeys.remove("a/b")).resolves.toEqual({ ok: true, value: undefined });
  });

  it.each([
    [401, "reauthentication-required", "reauthentication-required"],
    [401, "not-signed-in", "signed-out"],
    [404, undefined, "not-found"],
    [409, "last-credential", "last-credential"],
  ])("answers %i %s as %s", async (status, code, reason) => {
    server.use(http.delete(at("/api/roux/auth/me/passkeys/x"), () => refused(status, code)));

    await expect(createAuthClient().me.passkeys.remove("x")).resolves.toMatchObject({ ok: false, reason, status });
  });

  it("throws on a 409 that does not say last-credential", async () => {
    server.use(http.delete(at("/api/roux/auth/me/passkeys/x"), () => refused(409)));

    await expect(createAuthClient().me.passkeys.remove("x")).rejects.toMatchObject({
      reason: "unexpected",
      status: 409,
    });
  });
});

describe("what the browser or the server leaves out", () => {
  it("registers when the options list no passkeys to exclude and the browser names no transports", async () => {
    let body: { publicKey?: { credential?: { response?: { transports?: unknown } } } } = {};
    const bare: Partial<typeof CREATION_OPTIONS> = { ...CREATION_OPTIONS };
    delete bare.excludeCredentials;
    server.use(
      http.post(at("/api/roux/auth/me/passkeys/options"), () => HttpResponse.json(bare)),
      http.post(at("/api/roux/auth/me/passkeys"), async ({ request }) => {
        body = (await request.json()) as typeof body;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    create.mockResolvedValue({ ...created, response: { ...created.response, getTransports: undefined } });

    await expect(createAuthClient().me.passkeys.register("Laptop")).resolves.toEqual({ ok: true, value: undefined });
    expect(create.mock.calls[0]?.[0].publicKey?.excludeCredentials).toEqual([]);
    expect(body.publicKey?.credential?.response?.transports).toEqual([]);
  });

  it("signs in with an assertion that has no user handle", async () => {
    let body: { response?: { userHandle?: unknown } } = {};
    server.use(
      http.post(at("/api/roux/auth/passkey/sign-in/options"), () => HttpResponse.json(REQUEST_OPTIONS)),
      http.post(at("/api/roux/auth/passkey/sign-in"), async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ identityId: "i1" });
      }),
    );
    get.mockResolvedValue({ ...asserted, response: { ...asserted.response, userHandle: null } });

    await expect(createAuthClient().passkeys.signIn()).resolves.toMatchObject({ ok: true });
    expect(body.response?.userHandle).toBeNull();
  });

  it("lets a failure that is not the browser's DOMException through", async () => {
    server.use(http.post(at("/api/roux/auth/passkey/sign-in/options"), () => HttpResponse.json(REQUEST_OPTIONS)));
    const failure = new TypeError("broken");
    get.mockRejectedValue(failure);

    await expect(createAuthClient().passkeys.signIn()).rejects.toBe(failure);
  });
});

describe("a passkey call the server answers unexpectedly", () => {
  it("throws when the sign-in options fail", async () => {
    server.use(http.post(at("/api/roux/auth/passkey/sign-in/options"), () => refused(500)));

    await expect(createAuthClient().passkeys.signIn()).rejects.toMatchObject({ reason: "unexpected", status: 500 });
  });

  it("throws when the sign-in itself fails", async () => {
    server.use(
      http.post(at("/api/roux/auth/passkey/sign-in/options"), () => HttpResponse.json(REQUEST_OPTIONS)),
      http.post(at("/api/roux/auth/passkey/sign-in"), () => refused(500)),
    );
    get.mockResolvedValue(asserted);

    await expect(createAuthClient().passkeys.signIn()).rejects.toMatchObject({ reason: "unexpected", status: 500 });
  });

  it("throws when registering fails", async () => {
    server.use(
      http.post(at("/api/roux/auth/me/passkeys/options"), () => HttpResponse.json(CREATION_OPTIONS)),
      http.post(at("/api/roux/auth/me/passkeys"), () => refused(500)),
    );
    create.mockResolvedValue(created);

    await expect(createAuthClient().me.passkeys.register("Laptop")).rejects.toMatchObject({
      reason: "unexpected",
      status: 500,
    });
  });
});
