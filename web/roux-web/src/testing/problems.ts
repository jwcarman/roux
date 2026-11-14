const PROBLEM_JSON = { "Content-Type": "application/problem+json" };

/** A 400 Problem Detail naming invalid fields, as the server's ProblemsAdvice answers. */
export function invalidFields(fields: Record<string, string>): Response {
  const body = {
    type: "about:blank",
    title: "Bad Request",
    status: 400,
    detail: "The request has invalid fields",
    errors: Object.entries(fields).map(([field, message]) => ({ field, message })),
  };
  return new Response(JSON.stringify(body), { status: 400, headers: PROBLEM_JSON });
}

/** A 400 Problem Detail for a broken rule (an InvariantViolationException): `detail` and no fields. */
export function invariantViolation(detail: string): Response {
  const body = { type: "about:blank", title: "Bad Request", status: 400, detail };
  return new Response(JSON.stringify(body), { status: 400, headers: PROBLEM_JSON });
}
