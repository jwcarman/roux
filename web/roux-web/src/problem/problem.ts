/** One field's problem in a 400. */
export interface FieldProblem {
  field: string;
  message: string;
}

/** An RFC 9457 Problem Detail, as the server answers every error. */
export interface Problem {
  /** `about:blank` when the server sent none, as RFC 9457 defines. */
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: FieldProblem[];
  /** On a 500 only: the reference the server logged the failure under. */
  errorId?: string;
}

function isFieldProblem(value: unknown): value is FieldProblem {
  const entry = value as { field?: unknown; message?: unknown } | null;
  return typeof entry?.field === "string" && typeof entry.message === "string";
}

/**
 * The problem in a failed response. A response that is not `application/problem+json`, or whose
 * body cannot be read, gives a problem built from its status. Never throws.
 */
export async function problemOf(response: Response): Promise<Problem> {
  const fallback: Problem = { type: "about:blank", title: response.statusText, status: response.status };
  if (!response.headers.get("Content-Type")?.includes("application/problem+json")) {
    return fallback;
  }
  try {
    // Object() turns a null or primitive body into an object with none of a problem's members,
    // so it reads as the fallback.
    const body = Object(await response.json()) as Record<string, unknown>;
    const problem: Problem = {
      type: typeof body.type === "string" ? body.type : "about:blank",
      title: typeof body.title === "string" ? body.title : fallback.title,
      status: typeof body.status === "number" ? body.status : fallback.status,
    };
    if (typeof body.detail === "string") problem.detail = body.detail;
    if (typeof body.instance === "string") problem.instance = body.instance;
    if (typeof body.errorId === "string") problem.errorId = body.errorId;
    if (Array.isArray(body.errors) && body.errors.length > 0 && body.errors.every(isFieldProblem)) {
      problem.errors = body.errors;
    }
    return problem;
  } catch {
    return fallback;
  }
}
