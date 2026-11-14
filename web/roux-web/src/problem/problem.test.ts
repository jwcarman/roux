import { describe, expect, it } from "vitest";
import { problemOf } from "./problem";

function problemResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/problem+json" } });
}

describe("problemOf", () => {
  it("reads a problem body", async () => {
    const problem = await problemOf(
      problemResponse(
        {
          title: "Bad Request",
          status: 400,
          detail: "The request has invalid fields",
          instance: "/api/members/me",
          errors: [{ field: "displayName", message: "Must not be blank" }],
        },
        400,
      ),
    );
    expect(problem).toEqual({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      detail: "The request has invalid fields",
      instance: "/api/members/me",
      errors: [{ field: "displayName", message: "Must not be blank" }],
    });
  });

  it("builds one from a response that is not a problem", async () => {
    const problem = await problemOf(new Response("upstream down", { status: 502, statusText: "Bad Gateway" }));
    expect(problem).toEqual({ type: "about:blank", title: "Bad Gateway", status: 502 });
  });

  it("tolerates a malformed problem body", async () => {
    const response = new Response("{not json", { status: 500, statusText: "Internal Server Error", headers: { "Content-Type": "application/problem+json" } });
    await expect(problemOf(response)).resolves.toEqual({ type: "about:blank", title: "Internal Server Error", status: 500 });
  });

  it("drops field errors it cannot read and keeps the error id", async () => {
    const problem = await problemOf(
      problemResponse({ title: "Internal Server Error", status: 500, errorId: "abc", errors: [{ field: 1 }, "x"] }, 500),
    );
    expect(problem.errorId).toBe("abc");
    expect(problem.errors).toBeUndefined();
  });

  it("keeps the type the server sent", async () => {
    const problem = await problemOf(problemResponse({ type: "https://example.com/taken", title: "Conflict", status: 409 }, 409));
    expect(problem).toEqual({ type: "https://example.com/taken", title: "Conflict", status: 409 });
  });

  it("takes the title and status from the response when the body has none it can read", async () => {
    const response = new Response(JSON.stringify({ title: 7, status: "409" }), {
      status: 409,
      statusText: "Conflict",
      headers: { "Content-Type": "application/problem+json" },
    });
    await expect(problemOf(response)).resolves.toEqual({ type: "about:blank", title: "Conflict", status: 409 });
  });

  it.each(["null", "42"])("builds one from a problem body that is not an object (%s)", async (body) => {
    const response = new Response(body, { status: 503, statusText: "Service Unavailable", headers: { "Content-Type": "application/problem+json" } });
    await expect(problemOf(response)).resolves.toEqual({ type: "about:blank", title: "Service Unavailable", status: 503 });
  });

  it("builds one from a JSON body that is not a problem", async () => {
    const response = new Response(JSON.stringify({ title: "Teapot", status: 418, detail: "short and stout" }), {
      status: 400,
      statusText: "Bad Request",
      headers: { "Content-Type": "application/json" },
    });
    await expect(problemOf(response)).resolves.toStrictEqual({ type: "about:blank", title: "Bad Request", status: 400 });
  });

  it("builds one from a response with no content type", async () => {
    const response = new Response(null, { status: 502, statusText: "Bad Gateway" });
    await expect(problemOf(response)).resolves.toStrictEqual({ type: "about:blank", title: "Bad Gateway", status: 502 });
  });

  it("takes the status from the body over the response's", async () => {
    const problem = await problemOf(problemResponse({ title: "Unprocessable", status: 422 }, 400));
    expect(problem.status).toBe(422);
  });

  it("leaves out what the body does not say", async () => {
    const problem = await problemOf(problemResponse({ title: "Gone", status: 410, detail: 1, instance: 2, errorId: 3, errors: [] }, 410));
    expect(problem).toStrictEqual({ type: "about:blank", title: "Gone", status: 410 });
  });

  it.each([
    ["an entry without a field", { message: "m" }],
    ["an entry without a message", { field: "f" }],
    ["a null entry", null],
  ])("drops the field errors when one is %s, and keeps the rest", async (_, entry) => {
    const problem = await problemOf(
      problemResponse({ title: "Bad Request", status: 400, detail: "d", errors: [{ field: "a", message: "b" }, entry] }, 400),
    );
    expect(problem).toStrictEqual({ type: "about:blank", title: "Bad Request", status: 400, detail: "d" });
  });
});
