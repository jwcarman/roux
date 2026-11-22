import { chmodSync, cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

/** The longest name roux's Appearance page takes (roux-spa's `ShellTheme.MAX_APP_NAME`). */
export const MAX_APP_NAME = 60;

export interface CreateOptions {
  /** The new app's directory, Maven artifact and npm name: `acme-gym`. */
  directory: string;
  /** What people see until the owner renames the app: `Acme Gym`. */
  name: string;
}

export interface CreateContext {
  /** The exported template to copy. */
  template: string;
  /** Where the directory is made. */
  cwd: string;
  /** Runs git with the arguments in a directory; true when it succeeded. */
  git: (args: string[], cwd: string) => boolean;
}

export type CreateResult = { ok: true; directory: string; committed: boolean } | { ok: false; message: string };

export type ParsedArgs = { ok: true; options: CreateOptions } | { ok: false; message: string };

const USAGE = 'usage: npm create @jwcarman/roux-app <directory> [-- --name "App Name"]';
const DIRECTORY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
// npm leaves a .gitignore out of a package, so the template ships each one under this name.
const SHIPPED_GITIGNORE = "_gitignore";

export function directoryError(directory: string): string | undefined {
  return DIRECTORY.test(directory)
    ? undefined
    : "The directory is the app's Maven artifact and npm name: lowercase letters, digits and single dashes, starting with a letter (acme-gym).";
}

export function nameError(name: string): string | undefined {
  const trimmed = name.trim();
  return trimmed.length === 0 || trimmed.length > MAX_APP_NAME || /[\p{Cc}]/u.test(trimmed)
    ? `The name is 1 to ${MAX_APP_NAME} characters on one line (Acme Gym).`
    : undefined;
}

/** `acme-gym` → `Acme Gym`. */
export function displayNameOf(directory: string): string {
  return directory
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * The template's names replaced with the app's: `Roux App` with the name (as a JSON string where
 * it is quoted, which YAML reads the same way) and `roux-app` with the directory.
 */
export function renameIn(text: string, { directory, name }: CreateOptions): string {
  return text
    .replaceAll('"Roux App"', JSON.stringify(name))
    .replaceAll("Roux App", name)
    .replaceAll("roux-app", directory);
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  let name: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--name") {
      if (i + 1 >= argv.length) {
        return { ok: false, message: USAGE };
      }
      name = argv[++i];
    } else if (arg.startsWith("--name=")) {
      name = arg.slice("--name=".length);
    } else if (arg.startsWith("-")) {
      return { ok: false, message: USAGE };
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) {
    return { ok: false, message: USAGE };
  }
  const [directory] = positional;
  const problem = directoryError(directory) ?? (name === undefined ? undefined : nameError(name));
  if (problem) {
    return { ok: false, message: problem };
  }
  return { ok: true, options: { directory, name: name?.trim() ?? displayNameOf(directory) } };
}

/** Every file under the directory, depth first. */
function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

/**
 * Copies the template into `options.directory` under `cwd`, names it, restores its .gitignore
 * files, makes `mvnw` runnable and makes the first commit. A directory that exists is left alone.
 */
export function create(options: CreateOptions, { template, cwd, git }: CreateContext): CreateResult {
  const directory = resolve(cwd, options.directory);
  if (existsSync(directory)) {
    return { ok: false, message: `${directory} already exists.` };
  }
  cpSync(template, directory, { recursive: true });
  for (const file of filesUnder(directory)) {
    const bytes = readFileSync(file);
    // A NUL byte: not text, so copied as it is.
    if (!bytes.includes(0)) {
      writeFileSync(file, renameIn(bytes.toString("utf8"), options));
    }
    if (basename(file) === SHIPPED_GITIGNORE) {
      renameSync(file, join(file, "..", ".gitignore"));
    }
  }
  const wrapper = join(directory, "mvnw");
  if (existsSync(wrapper)) {
    chmodSync(wrapper, 0o755);
  }
  const committed = [
    ["init", "--quiet"],
    ["add", "--all"],
    ["commit", "--quiet", "--message", `Start ${options.name} from roux's app template`],
  ].every((args) => git(args, directory));
  return { ok: true, directory, committed };
}
