import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const bundle = join("runtime", "roux-problems", "src", "main", "resources", "ContributorValidationMessages.properties");

/**
 * The server's message bundle. Found by walking up from here, so the tests read it from a copy of
 * the package too (Stryker runs the tests in a sandbox inside the package).
 */
function bundlePath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, bundle))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(bundle + " not found above " + fileURLToPath(import.meta.url));
    }
    dir = parent;
  }
  return join(dir, bundle);
}

/** The bundle's `key=value` lines (comments and blank lines skipped). */
function messages(): Map<string, string> {
  const entries = readFileSync(bundlePath(), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()] as const;
    });
  return new Map(entries);
}

/** The bundle key of `constraint`: Jakarta's, Hibernate's `URL`, or one of roux's own (`Phone`, `NotInFuture`). */
function keyOf(constraint: string): string {
  if (constraint === "URL") {
    return "org.hibernate.validator.constraints.URL.message";
  }
  if (constraint === "Phone" || constraint === "NotInFuture") {
    return `org.jwcarman.roux.problems.constraints.${constraint}.message`;
  }
  return `jakarta.validation.constraints.${constraint}.message`;
}

/**
 * The server's message for `constraint` (its short name: `"NotBlank"`, `"Size"`, `"URL"`, ...), with
 * its `{name}` placeholders filled from `args`.
 */
export function validationMessage(constraint: string, args: Record<string, string | number> = {}): string {
  const key = keyOf(constraint);
  const message = messages().get(key);
  if (message === undefined) {
    throw new Error(`${key} is not in ${bundle}`);
  }
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in args ? String(args[name]) : placeholder,
  );
}
