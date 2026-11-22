import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  mkdirSync(join(template, "src/main/resources"), { recursive: true });
  writeFileSync(join(template, "pom.xml"), "<artifactId>roux-app</artifactId>\n<name>roux-app</name>\n");
  writeFileSync(
    join(template, "src/main/resources/application.yml"),
    'name: roux-app\napp-name: "Roux App"\nfrom: noreply@roux-app.test\n',
  );
  writeFileSync(join(template, "frontend/package.json"), '{ "name": "roux-app-web" }\n');
  writeFileSync(join(template, "README.md"), "# Roux App\n");
  writeFileSync(join(template, "_gitignore"), "target/\n");
  writeFileSync(join(template, "frontend/_gitignore"), "dist/\n");
  writeFileSync(join(template, "mvnw"), "#!/bin/sh\n");
  chmodSync(join(template, "mvnw"), 0o644);
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
        "The directory is the app's Maven artifact and npm name: lowercase letters, digits and single dashes, starting with a letter (acme-gym).",
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
    expect(nameError(name)).toBe("The name is 1 to 60 characters on one line (Acme Gym).");
  });

  it("refuses ${, which Spring would read as a placeholder and refuse to start", () => {
    expect(nameError("Deals ${today}")).toBe("The name cannot contain ${ (Spring reads it as a placeholder).");
    expect(nameError("Deals $ {today}")).toBeUndefined();
  });
});

describe("displayNameOf", () => {
  it("capitalizes each part of the directory", () => {
    expect(displayNameOf("acme-gym")).toBe("Acme Gym");
    expect(displayNameOf("gym2")).toBe("Gym2");
  });
});

describe("renameIn", () => {
  it("puts the name in a quoted value as a quoted string, so YAML reads it back", () => {
    expect(renameIn('app-name: "Roux App"', OPTIONS)).toBe('app-name: "Acme Gym"');
    expect(renameIn('app-name: "Roux App"', { ...OPTIONS, name: 'Joe\'s "Gym"' })).toBe('app-name: "Joe\'s \\"Gym\\""');
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

  it("copies the template under the directory, with the app's names in the seven spots", () => {
    const result = create(OPTIONS, { template, cwd: work, git: git() });

    expect(result).toEqual({ ok: true, directory: join(work, "acme-gym"), committed: true });
    expect(read("pom.xml")).toBe("<artifactId>acme-gym</artifactId>\n<name>acme-gym</name>\n");
    expect(read("src/main/resources/application.yml")).toBe(
      'name: acme-gym\napp-name: "Acme Gym"\nfrom: noreply@acme-gym.test\n',
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

  it("makes the Maven wrapper runnable", () => {
    create(OPTIONS, { template, cwd: work, git: git() });

    expect(statSync(join(work, "acme-gym/mvnw")).mode & 0o111).toBe(0o111);
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
      [["init", "--quiet"], dir],
      [["add", "--all"], dir],
      // Executable in the commit even where the file system keeps no such bit (Windows).
      [["update-index", "--chmod=+x", "mvnw"], dir],
      [["commit", "--quiet", "--message", "Start Acme Gym from roux's app template"], dir],
    ]);
  });

  it("marks no wrapper executable when the template has none", () => {
    rmSync(join(template, "mvnw"));
    const run = git();
    create(OPTIONS, { template, cwd: work, git: run });

    expect(run.mock.calls.map(([args]) => args[0])).toEqual(["init", "add", "commit"]);
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
    const run = vi.fn(() => false);

    expect(create(OPTIONS, { template, cwd: work, git: run })).toMatchObject({ ok: true, committed: false });
    expect(run).toHaveBeenCalledOnce();
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
