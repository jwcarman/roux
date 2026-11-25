import { create, parseArgs, type CreateContext } from "./create.js";

export interface Io extends CreateContext {
  out: (line: string) => void;
  err: (line: string) => void;
}

/** `npm create @jwcarman/roux-app <directory>`: makes the app, then says how to start it. 0 or 1. */
export function main(argv: readonly string[], io: Io): number {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    io.err(parsed.message);
    return 1;
  }
  const result = create(parsed.options, io);
  if (!result.ok) {
    io.err(result.message);
    return 1;
  }
  const { directory, name } = parsed.options;
  [
    `Created ${name} in ${result.directory}.`,
    ...(result.committed ? [] : ["git did not make the first commit; make it yourself."]),
    "",
    "Start it (Docker running, Go 1.27, Node 20 or later):",
    "",
    `  cd ${directory}`,
    "  make dev",
    "",
    "Then open http://localhost:5173 and sign in as owner@example.com: the link is in Mailpit, http://localhost:8025.",
    "",
    `Building with Claude Code? Open it in ${directory} and trust the folder: it installs roux's skill when you accept.`,
  ].forEach((line) => io.out(line));
  return 0;
}
