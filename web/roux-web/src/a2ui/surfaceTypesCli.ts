// The logic of the `roux-surface-types` bin, with its file access passed in so tests can drive it. The bin
// (`bin/roux-surface-types.mjs`) only supplies the real file system and the process's arguments and exit code.
import { PRIMITIVES } from "./primitives";
import { surfaceTypes, type SurfaceJson } from "./surfaceTypes";

/** The bin's side effects. `read` returns undefined for a file that does not exist. */
export interface SurfaceTypesIo {
  read(path: string): string | undefined;
  write(path: string, text: string): void;
  log(line: string): void;
  error(line: string): void;
}

const SURFACE_SUFFIX = ".surface.json";
const USAGE = "usage: roux-surface-types [--check] <file.surface.json>...";

/**
 * Writes `<id>.surface.gen.ts` beside each `<id>.surface.json` given, or with `--check` writes nothing and reports
 * each generated file that is missing or stale. Returns the exit code: 0, or 1 after printing what to fix.
 */
export function runSurfaceTypes(args: readonly string[], io: SurfaceTypesIo): number {
  const check = args.includes("--check");
  const files = args.filter((arg) => arg !== "--check");
  if (files.length === 0) {
    io.error(USAGE);
    return 1;
  }
  let failed = false;
  for (const file of files) {
    try {
      failed = !generate(file, check, io) || failed;
    } catch (error) {
      io.error(`${file}: ${(error as Error).message}`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

/** Returns false when `--check` finds the file stale; throws when the surface cannot be typed. */
function generate(file: string, check: boolean, io: SurfaceTypesIo): boolean {
  if (!file.endsWith(SURFACE_SUFFIX)) throw new Error("not a surface file; name it <id>.surface.json.");
  const source = io.read(file);
  if (source === undefined) throw new Error("file not found.");
  const generated = `${file.slice(0, -SURFACE_SUFFIX.length)}.surface.gen.ts`;
  const text = surfaceTypes(JSON.parse(source) as SurfaceJson, PRIMITIVES);
  if (check) {
    if (io.read(generated) === text) return true;
    io.error(`${generated} is stale; run roux-surface-types ${file}`);
    return false;
  }
  io.write(generated, text);
  io.log(`wrote ${generated}`);
  return true;
}
