#!/usr/bin/env node
// Guide and reference coverage check. Exits 1 (one line per problem) unless
//  (a) every public roux name (web entry-point exports, and the exported top-level names of the Go
//      packages an app uses, from `go doc -short`) appears in backticks in some docs/guides/*.md,
//  (b) every public roux name appears in backticks in some plugins/roux/skills/roux/references/*.md,
//  (c) every name a reference imports from "@jwcarman/roux-web/<sub>" is an export of that subpath,
//  (d) every `pkg.Name` the guides and references write, for those Go packages, exists, so a rename
//      breaks this check instead of the agents, and
//  (e) SKILL.md's index names every reference with its size, "(~N tokens)", within 20% of the
//      file's bytes / 4, so an agent can tell a whole read from a grep before it opens one.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const guidesDir = join(root, "docs/guides");
const referencesDir = join(root, "plugins/roux/skills/roux/references");
// roux-web's entries are its package's subpath exports ("./money" is src/money/index.ts).
const webEntries = Object.keys(JSON.parse(readFileSync(join(root, "web/roux-web/package.json"), "utf8")).exports).map(
  (subpath) => subpath.replace(/^\.\//, ""),
);

// The Go packages an app imports, by import path under the module, and the name it is written
// with. Their exported top-level names are the Go API the docs must cover.
const goPackages = [
  "app", "problem", "api", "page", "users", "authz", "activity", "money", "organization", "pgdb",
  "rouxtest", "authn/authntest",
];
// Exported but not for apps: wiring app.Main does, and helpers roux's own packages share.
const excludedGo = new Set([
  "app.SecureCookies", "app.Server", "app.APIKeys", "app.EmailLink", "app.JWT", "app.OIDC", "app.Users",
  "problem.ContentType", "problem.Write", "problem.Internal", "problem.MethodNotAllowed",
  "api.ErrorRenderer", "api.HandlerFunc", "api.Prefix", "api.Recoverer", "api.RouxPrefix", "api.NewMux",
  "authz.Service", "page.DefaultTiebreak", "organization.NewCalendar", "organization.NewContext",
  "pgdb.RegisterErrors", "pgdb.Order", "authntest.NewClock", "authntest.NewWith", "authntest.NewWithConfig",
]);

const problems = [];
const rel = (file) => relative(root, file);

function markdownFiles(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md").sort() : [];
}

function webExports(file) {
  const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const names = [];
  // `export * from` cannot be resolved without following the module graph; report it so nobody relies on it.
  if (/export\s+\*\s+from/.test(source)) {
    problems.push(`unresolvable export * in ${rel(file)}: list names explicitly`);
  }
  for (const [, body] of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const item of body.split(",")) {
      const entry = item.trim().replace(/^type\s+/, "");
      if (!entry) continue;
      const alias = entry.split(/\s+as\s+/);
      names.push(alias[alias.length - 1].trim());
    }
  }
  return names;
}

function goNames(pkg) {
  // `go doc -all` prints every exported declaration at the start of a line: funcs and types, and
  // the members of `const (` and `var (` groups indented by one tab. Methods and fields are not
  // top-level names.
  const out = execFileSync("go", ["doc", "-all", `./${pkg}`], { cwd: root, encoding: "utf8" });
  const names = new Set();
  let group = false;
  for (const line of out.split("\n")) {
    if (/^(const|var) \($/.test(line)) group = true;
    else if (group && line === ")") group = false;
    else if (group) {
      const member = /^\t([A-Z]\w*)/.exec(line);
      if (member) names.add(member[1]);
    } else {
      const decl = /^(?:func|type|const|var) ([A-Z]\w*)/.exec(line);
      if (decl) names.add(decl[1]);
    }
  }
  return [...names];
}

const publicNames = []; // { name, file }
for (const entry of webEntries) {
  const file = join(root, "web/roux-web/src", entry, "index.ts");
  if (!existsSync(file)) {
    problems.push(`missing entry point: ${rel(file)}`);
    continue;
  }
  for (const name of webExports(file)) publicNames.push({ name, file });
}
const goExports = new Map(); // short package name → its exported names
for (const pkg of goPackages) {
  const short = pkg.split("/").pop();
  const names = goNames(pkg);
  goExports.set(short, new Set(names));
  for (const name of names) {
    if (!excludedGo.has(`${short}.${name}`)) publicNames.push({ name, file: join(root, pkg) });
  }
}

function backtickNames(dir) {
  const names = new Set();
  for (const file of markdownFiles(dir)) {
    const text = readFileSync(join(dir, file), "utf8");
    // A name counts when it is in a backtick span on one line, or in a fenced code block.
    const spans = [...text.matchAll(/^```[\w-]*\n([\s\S]*?)^ *```/gm)].map(([, block]) => block);
    for (const [, span] of text.replace(/^```[\w-]*\n[\s\S]*?^ *```/gm, "").matchAll(/`([^`\n]+)`/g)) spans.push(span);
    for (const span of spans) {
      for (const [identifier] of span.matchAll(/[A-Za-z_$][\w$]*/g)) names.add(identifier);
    }
  }
  return names;
}

// (a) and (b): every name appears inside a backtick span of some guide and of some reference.
for (const [where, dir] of [["guides", guidesDir], ["references", referencesDir]]) {
  const documented = backtickNames(dir);
  const reported = new Set();
  for (const { name, file } of publicNames) {
    if (documented.has(name) || reported.has(name)) continue;
    reported.add(name);
    problems.push(`missing from ${where}: ${name} (${rel(file)})`);
  }
}

// (c) and (d): every roux import a reference shows exists.
const webNames = new Map();
for (const entry of webEntries) {
  const file = join(root, "web/roux-web/src", entry, "index.ts");
  if (existsSync(file)) webNames.set(entry, new Set(webExports(file)));
}
for (const reference of markdownFiles(referencesDir)) {
  const text = readFileSync(join(referencesDir, reference), "utf8");
  for (const [, body, sub] of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']@jwcarman\/roux-web\/([\w/-]+)["']/g)) {
    const exported = webNames.get(sub);
    for (const item of body.split(",")) {
      const name = item.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (name && !exported?.has(name)) problems.push(`unknown import in ${reference}: ${name} from ${sub}`);
    }
  }
}
for (const [dir, file] of [...markdownFiles(guidesDir).map((f) => [guidesDir, f]), ...markdownFiles(referencesDir).map((f) => [referencesDir, f])]) {
  const text = readFileSync(join(dir, file), "utf8");
  for (const [, pkg, name] of text.matchAll(/\b([a-z]+)\.([A-Z]\w*)/g)) {
    const exported = goExports.get(pkg);
    if (exported && !exported.has(name)) problems.push(`unknown Go name in ${rel(join(dir, file))}: ${pkg}.${name}`);
  }
}

const skillFile = join(root, "plugins/roux/skills/roux/SKILL.md");
const skill = readFileSync(skillFile, "utf8");
for (const reference of markdownFiles(referencesDir)) {
  const tokens = Math.round(statSync(join(referencesDir, reference)).size / 4);
  const row = skill.split("\n").find((line) => line.includes(`\`references/${reference}\``));
  const label = row?.match(/\(~([\d,]+) tokens\)/);
  if (!label) {
    problems.push(`no size in SKILL.md for references/${reference}: add (~${tokens} tokens)`);
  } else if (Math.abs(Number(label[1].replace(",", "")) - tokens) > tokens * 0.2) {
    problems.push(`stale size in SKILL.md for references/${reference}: says ~${label[1]}, is ~${tokens} tokens`);
  }
}

if (problems.length > 0) {
  for (const line of problems) console.log(line);
  process.exit(1);
}
console.log(`ok: ${publicNames.length} public names documented in guides and references`);
