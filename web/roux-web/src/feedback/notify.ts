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
  /** A refused request: `title` names the failure, the description is the problem's detail, then its reference on its own line. */
  problem(problem: Problem, title: string): void {
    const reference = problem.errorId === undefined ? undefined : `Reference: ${problem.errorId}`;
    const description = [problem.detail, reference].filter((line) => line !== undefined).join("\n");
    toaster.create({ type: "error", title, description: description === "" ? undefined : description });
  },
};
