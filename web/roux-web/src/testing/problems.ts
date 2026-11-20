const PROBLEM_JSON = { "Content-Type": "application/problem+json" };

/** A 400 Problem Detail naming invalid fields, as the server's ProblemsAdvice answers. */
export function invalidFields(fields: Record<string, string>): Response {
  const body = {
    title: "Bad Request",
    status: 400,
    detail: "The request has invalid fields",
    errors: Object.entries(fields).map(([field, message]) => ({ field, message })),
  };
  return new Response(JSON.stringify(body), { status: 400, headers: PROBLEM_JSON });
}

/** A 400 Problem Detail for a broken rule (an InvariantViolationException): `detail` and no fields. */
export function invariantViolation(detail: string): Response {
  const body = { title: "Bad Request", status: 400, detail };
  return new Response(JSON.stringify(body), { status: 400, headers: PROBLEM_JSON });
}

/** A 409 Problem Detail for a save at a version that is no longer the latest. */
export function stale(): Response {
  const body = {
    title: "Conflict",
    status: 409,
    detail: "This record changed since you loaded it",
  };
  return new Response(JSON.stringify(body), { status: 409, headers: PROBLEM_JSON });
}

/** A 404 Problem Detail, as the server answers a NotFoundException. */
export function notFound(detail: string): Response {
  const body = { title: "Not Found", status: 404, detail };
  return new Response(JSON.stringify(body), { status: 404, headers: PROBLEM_JSON });
}

/** A 500 Problem Detail, with the reference the server logged (`errorId`), as the server answers an unexpected failure. */
export function serverError(errorId = "7d1c2e0a-5b4f-4c1e-9a8b-0f6e2d3c4b5a"): Response {
  const body = { title: "Internal Server Error", status: 500, detail: "Something went wrong", errorId };
  return new Response(JSON.stringify(body), { status: 500, headers: PROBLEM_JSON });
}
