import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { checkAllAnswered, server, settle } from "./server";

describe("the fake network", () => {
  it("names a request no handler answered", async () => {
    await fetch("http://localhost/api/nowhere").catch(() => undefined);
    await fetch("http://localhost/api/elsewhere", { method: "POST" }).catch(() => undefined);

    expect(() => checkAllAnswered()).toThrow("No handler answered: GET /api/nowhere, POST /api/elsewhere");
    expect(() => checkAllAnswered()).not.toThrow();
  });

  it("settle waits until a request in flight has its answer", async () => {
    let answered = false;
    server.use(
      http.get("http://localhost/api/slow", async () => {
        await delay(30);
        return HttpResponse.json({});
      }),
    );
    void fetch("http://localhost/api/slow").then(() => {
      answered = true;
    });

    await settle();

    expect(answered).toBe(true);
  });

  it("settle gives up on a request held open after its timeout", async () => {
    const abort = new AbortController();
    server.use(
      http.get("http://localhost/api/forever", async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );
    void fetch("http://localhost/api/forever", { signal: abort.signal }).catch(() => undefined);
    const started = Date.now();

    await settle(50);
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);

    // Given up on, it does not hold up the next wait.
    const again = Date.now();
    await settle();
    expect(Date.now() - again).toBeLessThan(500);
    abort.abort();
  });

  it("never lets a request no handler answers reach the real network", async () => {
    let reached = false;
    const real = createServer((_request, response) => {
      reached = true;
      response.end("{}");
    });
    await new Promise<void>((resolve) => real.listen(0, "127.0.0.1", resolve));
    const { port } = real.address() as AddressInfo;

    const answer = await fetch(`http://127.0.0.1:${port}/api/real`).then(
      () => "answered",
      () => "refused",
    );

    expect(answer).toBe("refused");
    expect(reached).toBe(false);
    expect(() => checkAllAnswered()).toThrow("No handler answered: GET /api/real");
    await new Promise((resolve) => real.close(resolve));
  });
});
