import { describe, expect, it } from "vitest";
import { runSurfaceTypes, type SurfaceTypesIo } from "./surfaceTypesCli";

const JSON_FILE = "src/items/items.surface.json";
const GEN_FILE = "src/items/items.surface.gen.ts";
const SURFACE = JSON.stringify({
  id: "items",
  components: [
    { id: "root", component: "Column", children: ["n"] },
    { id: "n", component: "Stat", label: "N", value: { "@path": "/n" } },
  ],
});

function setup(files: Record<string, string | undefined>) {
  const written: Record<string, string> = {};
  const out: string[] = [];
  const err: string[] = [];
  const io: SurfaceTypesIo = {
    read: (path) => files[path],
    write: (path, text) => {
      written[path] = text;
    },
    log: (line) => out.push(line),
    error: (line) => err.push(line),
  };
  return { io, written, out, err };
}

function generated(): string {
  const run = setup({ [JSON_FILE]: SURFACE });
  runSurfaceTypes([JSON_FILE], run.io);
  return run.written[GEN_FILE];
}

describe("roux-surface-types", () => {
  it("writesTheGeneratedFileBesideTheSurface", () => {
    const run = setup({ [JSON_FILE]: SURFACE });
    expect(runSurfaceTypes([JSON_FILE], run.io)).toBe(0);
    expect(run.written[GEN_FILE]).toContain("export interface ItemsSurfaceData {\n  n: number;\n}");
    expect(run.out).toEqual([`wrote ${GEN_FILE}`]);
    expect(run.err).toEqual([]);
  });

  it("checkPassesOnAFreshFile", () => {
    const run = setup({ [JSON_FILE]: SURFACE, [GEN_FILE]: generated() });
    expect(runSurfaceTypes(["--check", JSON_FILE], run.io)).toBe(0);
    expect(run.written).toEqual({});
    expect(run.err).toEqual([]);
  });

  it("checkFailsOnAStaleFile", () => {
    for (const gen of [{ [GEN_FILE]: "// old\n" }, {}]) {
      const run = setup({ [JSON_FILE]: SURFACE, ...gen });
      expect(runSurfaceTypes(["--check", JSON_FILE], run.io)).toBe(1);
      expect(run.err).toEqual([`${GEN_FILE} is stale; run roux-surface-types ${JSON_FILE}`]);
      expect(run.written).toEqual({});
    }
  });

  it("checkNamesEveryStaleFile", () => {
    const other = "src/x/x.surface.json";
    const run = setup({ [JSON_FILE]: SURFACE, [other]: SURFACE.replace("items", "x") });
    expect(runSurfaceTypes([JSON_FILE, "--check", other], run.io)).toBe(1);
    expect(run.err).toEqual([
      `${GEN_FILE} is stale; run roux-surface-types ${JSON_FILE}`,
      "src/x/x.surface.gen.ts is stale; run roux-surface-types src/x/x.surface.json",
    ]);
  });

  it("aSurfaceThatCannotBeTypedFailsNamingTheFile", () => {
    const bad = JSON.stringify({ id: "items", components: [{ id: "g", component: "Grid" }] });
    const run = setup({ [JSON_FILE]: bad });
    expect(runSurfaceTypes([JSON_FILE], run.io)).toBe(1);
    expect(run.err).toEqual([`${JSON_FILE}: g is a "Grid", which the catalog doesn't define.`]);
    expect(run.written).toEqual({});
  });

  it("aFileThatIsNotJsonFailsNamingTheFile", () => {
    const run = setup({ [JSON_FILE]: "{" });
    expect(runSurfaceTypes([JSON_FILE], run.io)).toBe(1);
    expect(run.err[0]).toMatch(/^src\/items\/items\.surface\.json: /);
  });

  it("aMissingFileFailsNamingIt", () => {
    const run = setup({});
    expect(runSurfaceTypes([JSON_FILE], run.io)).toBe(1);
    expect(run.err).toEqual([`${JSON_FILE}: file not found.`]);
  });

  it("aFileNotNamedSurfaceJsonFails", () => {
    const run = setup({ "a.json": SURFACE });
    expect(runSurfaceTypes(["a.json"], run.io)).toBe(1);
    expect(run.err).toEqual(["a.json: not a surface file; name it <id>.surface.json."]);
  });

  it("noFilesPrintsTheUsage", () => {
    for (const args of [[], ["--check"]]) {
      const run = setup({});
      expect(runSurfaceTypes(args, run.io)).toBe(1);
      expect(run.err).toEqual(["usage: roux-surface-types [--check] <file.surface.json>..."]);
    }
  });
});
