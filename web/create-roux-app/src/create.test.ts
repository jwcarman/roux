import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create, directoryError, displayNameOf, nameError, parseArgs, renameIn } from "./create.js";

let work: string;
let template: string;

/** A small stand-in for the exported template, with each kind of file the real one has. */
function writeTemplate() {
  template = join(work, "template");
  mkdirSync(join(template, "frontend"), { recursive: true });
  mkdirSync(join(template, "cmd/server"), { recursive: true });
  writeFileSync(join(template, "go.mod"), "module roux-app\n");
  writeFileSync(
    join(template, "cmd/server/main.go"),
    '// Command server runs Roux App.\napp.Main(app.Config{Name: "roux-app", DisplayName: "Roux App"})\n',
  );
  writeFileSync(join(template, "frontend/package.json"), '{ "name": "roux-app-web" }\n');
  writeFileSync(join(template, "README.md"), "# Roux App\n");
  writeFileSync(join(template, "_gitignore"), "target/\n");
  writeFileSync(join(template, "frontend/_gitignore"), "dist/\n");
  // Agent settings outside the skills, which are named like any other file.
  mkdirSync(join(template, ".claude"), { recursive: true });
  writeFileSync(join(template, ".claude/notes.md"), "Roux App, module roux-app.\n");
  // roux's skill, which names the starter and the template's module on purpose.
  mkdirSync(join(template, ".claude/skills/roux/references"), { recursive: true });
  writeFileSync(join(template, ".claude/skills/roux/SKILL.md"), "Made by `create-roux-app`, module `roux-app`.\n");
  writeFileSync(join(template, ".claude/skills/roux/references/feature.md"), '"roux-app/internal/labels"\n');
  // Not text: copied as it is, even where its bytes happen to spell the name.
  writeFileSync(join(template, "frontend/icon.bin"), Buffer.from([0, 1, ...Buffer.from("roux-app")]));
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "create-roux-app-"));
  writeTemplate();
});

afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function read(...path: string[]) {
  return readFileSync(join(work, "acme-gym", ...path), "utf8");
}

const OPTIONS = { directory: "acme-gym", name: "Acme Gym" };

describe("directoryError", () => {
  it.each(["acme-gym", "gym", "a1", "acme-gym-2"])("accepts %s", (directory) => {
    expect(directoryError(directory)).toBeUndefined();
  });

  it.each(["Acme", "acme_gym", "-acme", "acme-", "acme--gym", "1acme", "", "apps/acme", "acme gym"])(
    "refuses %j",
    (directory) => {
      expect(directoryError(directory)).toBe(
        "The directory is the app's Go module and npm name: lowercase letters, digits and single dashes, starting with a letter (team-planner).",
      );
    },
  );
});

describe("nameError", () => {
  it("accepts a name of up to 60 characters", () => {
    expect(nameError("Acme Gym")).toBeUndefined();
    expect(nameError("x".repeat(60))).toBeUndefined();
  });

  it.each(["", "   ", "x".repeat(61), "Acme\nGym", "Acme\tGym"])("refuses %j", (name) => {
    expect(nameError(name)).toBe("The name is 1 to 60 characters on one line (Team Planner).");
  });

  it("takes ${ and quotes as they are", () => {
    expect(nameError('Deals ${today} "now"')).toBeUndefined();
  });
});

describe("displayNameOf", () => {
  it("capitalizes each part of the directory", () => {
    expect(displayNameOf("acme-gym")).toBe("Acme Gym");
    expect(displayNameOf("gym2")).toBe("Gym2");
  });
});

describe("renameIn", () => {
  it("puts the name in a quoted value as a quoted string, so Go reads it back", () => {
    expect(renameIn('DisplayName: "Roux App"', OPTIONS)).toBe('DisplayName: "Acme Gym"');
    expect(renameIn('DisplayName: "Roux App"', { ...OPTIONS, name: 'Joe\'s "Gym" \\ ${x}' })).toBe(
      'DisplayName: "Joe\'s \\"Gym\\" \\\\ ${x}"',
    );
  });

  it("takes a name's $ patterns literally", () => {
    for (const name of ["Ca$$h Gym", "Tick$' Gym", "A$&B", "Pre$`Gym"]) {
      expect(renameIn('app-name: "Roux App"\n# Roux App\n', { ...OPTIONS, name })).toBe(
        `app-name: ${JSON.stringify(name)}\n# ${name}\n`,
      );
    }
  });

  it("puts the name elsewhere as it is, and the directory in place of roux-app", () => {
    expect(renameIn("# Roux App\n<name>roux-app</name>\nroux-app-web", OPTIONS)).toBe(
      "# Acme Gym\n<name>acme-gym</name>\nacme-gym-web",
    );
  });
});

describe("parseArgs", () => {
  it("takes the directory, and names the app after it", () => {
    expect(parseArgs(["acme-gym"])).toEqual({ ok: true, options: { directory: "acme-gym", name: "Acme Gym" } });
  });

  it("takes the name from --name, before or after the directory, trimmed", () => {
    const expected = { ok: true, options: { directory: "acme-gym", name: "Acme Fitness" } };
    expect(parseArgs(["acme-gym", "--name", " Acme Fitness "])).toEqual(expected);
    expect(parseArgs(["--name", "Acme Fitness", "acme-gym"])).toEqual(expected);
    expect(parseArgs(["acme-gym", "--name=Acme Fitness"])).toEqual(expected);
  });

  it.each([
    [[], "usage"],
    [["acme-gym", "other"], "usage"],
    [["acme-gym", "--name"], "usage"],
    [["acme-gym", "--color", "red"], "usage"],
    [["--force"], "usage"],
    [["acme-gym", "--force"], "usage"],
    [["Acme"], "lowercase letters"],
    [["acme-gym", "--name", ""], "1 to 60 characters"],
  ])("refuses %j", (argv, says) => {
    const parsed = parseArgs(argv);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? "" : parsed.message).toContain(says);
  });

  it("says how to use it", () => {
    expect(parseArgs([])).toEqual({
      ok: false,
      message: 'usage: npm create @jwcarman/roux-app <directory> [-- --name "App Name"]',
    });
  });
});

describe("create", () => {
  const git = () => vi.fn<(args: string[], cwd: string) => boolean>(() => true);

  it("copies the template under the directory, with the app's names in every spot", () => {
    const result = create(OPTIONS, { template, cwd: work, git: git() });

    expect(result).toEqual({ ok: true, directory: join(work, "acme-gym"), committed: true });
    expect(read("go.mod")).toBe("module acme-gym\n");
    expect(read("cmd/server/main.go")).toBe(
      '// Command server runs Acme Gym.\napp.Main(app.Config{Name: "acme-gym", DisplayName: "Acme Gym"})\n',
    );
    expect(read("frontend/package.json")).toBe('{ "name": "acme-gym-web" }\n');
    expect(read("README.md")).toBe("# Acme Gym\n");
  });

  it("restores each .gitignore, which npm will not ship under its own name", () => {
    create(OPTIONS, { template, cwd: work, git: git() });

    expect(read(".gitignore")).toBe("target/\n");
    expect(read("frontend/.gitignore")).toBe("dist/\n");
    expect(existsSync(join(work, "acme-gym/_gitignore"))).toBe(false);
  });

  it("copies roux's skill as it is, since it names the starter and the template on purpose", () => {
    create(OPTIONS, { template, cwd: work, git: git() });

    expect(read(".claude/skills/roux/SKILL.md")).toBe("Made by `create-roux-app`, module `roux-app`.\n");
    expect(read(".claude/skills/roux/references/feature.md")).toBe('"roux-app/internal/labels"\n');
    expect(read(".claude/notes.md")).toBe("Acme Gym, module acme-gym.\n");
  });

  it("copies a file that is not text as it is", () => {
    create(OPTIONS, { template, cwd: work, git: git() });

    expect(readFileSync(join(work, "acme-gym/frontend/icon.bin"))).toEqual(
      Buffer.from([0, 1, ...Buffer.from("roux-app")]),
    );
  });

  it("starts a git repository with everything in its first commit", () => {
    const run = git();
    create(OPTIONS, { template, cwd: work, git: run });

    const dir = join(work, "acme-gym");
    expect(run.mock.calls).toEqual([
      [["config", "--get", "init.defaultBranch"], dir],
      [["init", "--quiet"], dir],
      [["add", "--all"], dir],
      [["commit", "--quiet", "--message", "Start Acme Gym from roux's app template"], dir],
    ]);
  });

  it("starts on main when the person has not chosen a default branch", () => {
    const run = vi.fn((args: string[]) => args[0] !== "config"); // init.defaultBranch is not set

    expect(create(OPTIONS, { template, cwd: work, git: run })).toMatchObject({ ok: true, committed: true });
    expect(run).toHaveBeenCalledWith(["init", "--quiet", "--initial-branch=main"], join(work, "acme-gym"));
  });

  it("says so when git could not make the first commit, and keeps the app", () => {
    const run = vi.fn((args: string[]) => args[0] !== "commit");

    expect(create(OPTIONS, { template, cwd: work, git: run })).toEqual({
      ok: true,
      directory: join(work, "acme-gym"),
      committed: false,
    });
    expect(read("README.md")).toBe("# Acme Gym\n");
  });

  it("stops at the first git step that fails", () => {
    const run = vi.fn<(args: string[], cwd: string) => boolean>(() => false);

    expect(create(OPTIONS, { template, cwd: work, git: run })).toMatchObject({ ok: true, committed: false });
    expect(run.mock.calls.map(([args]) => args[0])).toEqual(["config", "init"]);
  });

  it("refuses a directory that already exists, and leaves it alone", () => {
    mkdirSync(join(work, "acme-gym"));
    writeFileSync(join(work, "acme-gym/mine.txt"), "keep");
    const run = git();

    expect(create(OPTIONS, { template, cwd: work, git: run })).toEqual({
      ok: false,
      message: `${join(work, "acme-gym")} already exists.`,
    });
    expect(read("mine.txt")).toBe("keep");
    expect(run).not.toHaveBeenCalled();
  });
});
