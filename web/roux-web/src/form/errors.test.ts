import { describe, expect, it } from "vitest";
import { errorMessages, fieldErrorsOf } from "./errors";

describe("errorMessages", () => {
  it("keeps plain messages", () => {
    expect(errorMessages(["Enter a name"])).toEqual(["Enter a name"]);
  });

  it("reads the message of an error object, as a schema validator returns", () => {
    expect(errorMessages([{ message: "Too long", path: ["name"] }])).toEqual(["Too long"]);
  });

  it("flattens lists of errors", () => {
    expect(errorMessages([[{ message: "Too long" }, "Not an email"]])).toEqual(["Too long", "Not an email"]);
  });

  it("drops empty entries and repeats", () => {
    expect(errorMessages([undefined, null, "", "Required", "Required"])).toEqual(["Required"]);
  });

  it("never shows an object it cannot read", () => {
    expect(errorMessages([{ code: 42 }])).toEqual(["Invalid value"]);
  });
});

describe("fieldErrorsOf", () => {
  it("gives the first message for each field", () => {
    const problem = {
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      errors: [
        { field: "email", message: "Must be a valid email address" },
        { field: "email", message: "Must not be blank" },
        { field: "name", message: "Must not be blank" },
      ],
    };
    expect(fieldErrorsOf(problem)).toEqual({ email: "Must be a valid email address", name: "Must not be blank" });
  });

  it("is empty for a problem with no field errors", () => {
    expect(fieldErrorsOf({ type: "about:blank", title: "Conflict", status: 409 })).toStrictEqual({});
  });
});

describe("errorMessages and fieldErrorsOf, edge cases", () => {
  it("drops messages that are only whitespace", () => {
    expect(errorMessages(["   ", "Enter a name"])).toEqual(["Enter a name"]);
  });

  it("reads no field errors from a problem that names none", () => {
    expect(fieldErrorsOf({ type: "about:blank", title: "Bad Request", status: 400 })).toStrictEqual({});
  });
});
