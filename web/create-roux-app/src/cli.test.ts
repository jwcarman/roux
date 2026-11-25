import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "./cli.js";

let work: string;
let template: string;

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "create-roux-app-cli-"));
  template = join(work, "template");
  mkdirSync(template);
  writeFileSync(join(template, "README.md"), "# Roux App\n");
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function io(git = () => true) {
  return {
    template,
    cwd: work,
    git: vi.fn(git),
    out: vi.fn<(line: string) => void>(),
    err: vi.fn<(line: string) => void>(),
  };
}

describe("main", () => {
  it("creates the app and says how to run it", () => {
    const streams = io();

    expect(main(["acme-gym"], streams)).toBe(0);

    expect(streams.err).not.toHaveBeenCalled();
    expect(streams.out.mock.calls.map(([line]) => line)).toEqual([
      `Created Acme Gym in ${join(work, "acme-gym")}.`,
      "",
      "Start it (Docker running, Go 1.27, Node 20 or later):",
      "",
      "  cd acme-gym",
      "  make dev",
      "",
      "Then sign in at http://localhost:8080 as owner@example.com: the link is in Mailpit, http://localhost:8025.",
      "",
      "Building with Claude Code? Open it in acme-gym and install roux's skill: /plugin install roux@roux",
    ]);
  });

  it("says when it left the first commit to you", () => {
    const streams = io(() => false);

    expect(main(["acme-gym"], streams)).toBe(0);

    expect(streams.out).toHaveBeenCalledWith("git did not make the first commit; make it yourself.");
  });

  it("explains a bad argument and creates nothing", () => {
    const streams = io();

    expect(main(["Acme"], streams)).toBe(1);

    expect(streams.err).toHaveBeenCalledWith(expect.stringContaining("lowercase letters"));
    expect(streams.out).not.toHaveBeenCalled();
    expect(streams.git).not.toHaveBeenCalled();
  });

  it("explains a directory that already exists", () => {
    mkdirSync(join(work, "acme-gym"));
    const streams = io();

    expect(main(["acme-gym"], streams)).toBe(1);

    expect(streams.err).toHaveBeenCalledWith(`${join(work, "acme-gym")} already exists.`);
  });
});
