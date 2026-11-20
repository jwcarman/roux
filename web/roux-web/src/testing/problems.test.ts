import { describe, expect, it } from "vitest";
import { contract } from "./contracts";
import { invalidFields, invariantViolation, stale } from "./problems";

type Problem = Record<string, unknown>;

/** The server's answer in the shared fixture, without the instance a fake cannot know. */
function served(name: string): Problem {
  const problem = { ...contract<Problem>(name) };
  delete problem.instance;
  return problem;
}

async function answered(response: Response): Promise<{ status: number; type: string | null; body: Problem }> {
  return {
    status: response.status,
    type: response.headers.get("Content-Type"),
    body: (await response.json()) as Problem,
  };
}

describe("problem answers", () => {
  it("invalidFields answers as the server does for invalid fields", async () => {
    expect(await answered(invalidFields({ title: "Must not be blank" }))).toEqual({
      status: 400,
      type: "application/problem+json",
      body: served("problem-invalid-fields.json"),
    });
  });

  it("invariantViolation answers as the server does for a broken rule", async () => {
    expect(await answered(invariantViolation("A class meets at most 7 times a week"))).toEqual({
      status: 400,
      type: "application/problem+json",
      body: served("problem-invariant.json"),
    });
  });

  it("stale answers a conflict, as the server does for a save at an old version", async () => {
    const conflict = served("problem-conflict.json");

    expect(await answered(stale())).toEqual({
      status: 409,
      type: "application/problem+json",
      body: { ...conflict, detail: "This record changed since you loaded it" },
    });
  });
});
