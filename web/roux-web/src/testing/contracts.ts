import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The repository's shared contract fixtures. Found by walking up from here, so the tests read them
 * from a copy of the package too (Stryker runs the tests in a sandbox inside the package).
 */
function contractsDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "contracts", "session.json"))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("contracts/ not found above " + fileURLToPath(import.meta.url));
    }
    dir = parent;
  }
  return join(dir, "contracts");
}

/** The fixture `name` (e.g. `page.json`), parsed. */
export function contract<T>(name: string): T {
  return JSON.parse(readFileSync(join(contractsDir(), name), "utf8")) as T;
}

/** The names of the fixtures starting with `prefix`, sorted. */
export function contractNames(prefix: string): string[] {
  return readdirSync(contractsDir())
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .sort();
}
