import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server, settle } from "./server";

describe("settle", () => {
  it("waits until the app has its answer", async () => {
    server.use(
      http.get("http://localhost/slow", async () => {
        await delay(50);
        return HttpResponse.json({ ok: true });
      }),
    );
    let answer: unknown;
    void fetch("http://localhost/slow")
      .then((response) => response.json())
      .then((body: unknown) => {
        answer = body;
      });

    await settle();

    expect(answer).toEqual({ ok: true });
  });

  it("gives up on a request held open on purpose", async () => {
    server.use(
      http.get("http://localhost/held", async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );
    void fetch("http://localhost/held").catch(() => undefined);
    const started = Date.now();

    await settle(100);

    expect(Date.now() - started).toBeLessThan(1000);
  });
});
