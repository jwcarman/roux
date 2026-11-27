import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
  name: string;
  dependencies?: Record<string, string>;
  peerDependencies: Record<string, string>;
};

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "testing" ? [] : sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")
      ? [path]
      : [];
  });
}

describe("what the package imports", () => {
  it("is a peer dependency or a dependency, because the build leaves only those out of the bundle", () => {
    const provided = new Set([
      manifest.name,
      ...Object.keys(manifest.peerDependencies),
      ...Object.keys(manifest.dependencies ?? {}),
    ]);
    const missing = new Set<string>();
    for (const file of sources("src")) {
      for (const [, specifier] of readFileSync(file, "utf8").matchAll(/(?:from|import)\s+["']([^."'][^"']*)["']/g)) {
        const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
        if (!name.startsWith("node:") && !provided.has(name)) missing.add(`${name} (${file})`);
      }
    }
    expect([...missing], "add each to peerDependencies in package.json").toEqual([]);
  });
});
