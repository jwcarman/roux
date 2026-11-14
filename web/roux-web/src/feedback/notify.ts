import type { Problem } from "../problem";
import { toaster } from "./toaster";

/**
 * Tells the user how an action went: `notify.success("Invitation sent")`,
 * `notify.error("Couldn't save", detail)`. For the outcome of an action; a field's mistake stays under
 * the field.
 */
export const notify = {
  /** `action` adds a button to the toast, such as Undo. */
  success(title: string, action?: { label: string; onClick: () => void }): void {
    toaster.create({ type: "success", title, action });
  },
  error(title: string, detail?: string): void {
    toaster.create({ type: "error", title, description: detail });
  },
  /** A failed request: the problem's detail, or `fallback`; a server error adds its reference. */
  problem(problem: Problem, fallback: string): void {
    const reference = problem.errorId === undefined ? undefined : `Reference: ${problem.errorId}`;
    toaster.create({ type: "error", title: problem.detail ?? fallback, description: reference });
  },
};
