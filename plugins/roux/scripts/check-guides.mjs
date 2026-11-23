#!/usr/bin/env node
// Guide and reference coverage check. Exits 1 (one line per problem) unless
//  (a) every public roux name (web entry-point exports and public top-level Java types) appears in
//      backticks in some docs/guides/*.md,
//  (b) every public roux name appears in backticks in some plugins/roux/skills/roux/references/*.md,
//  (c) every name a reference imports from "@jwcarman/roux-web/<sub>" is an export of that subpath, and
//  (d) every org.jwcarman.roux type a reference imports is a public roux type.
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

// Public but not API: wiring that users never reference by name.
const excludedJava = new Set(["ProblemsRuntimeHints", "ValidationRuntimeHints", "RouxProblemsAutoConfiguration", "RouxAuditingAutoConfiguration", "RouxSpaAutoConfiguration", "RouxThemeAutoConfiguration", "RouxThemePersistenceAutoConfiguration", "RouxEmailAutoConfiguration", "RouxRolesAutoConfiguration", "RouxMoneyAutoConfiguration", "RouxOrganizationAutoConfiguration", "RouxActivityLogAutoConfiguration", "RouxActivityLogPersistenceAutoConfiguration", "RouxUsersAutoConfiguration", "RouxUsersPersistenceAutoConfiguration"]);

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

function javaFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return javaFiles(path);
    return path.endsWith(".java") ? [path] : [];
  });
}

const javaType = /^public\s+(?:(?:final|abstract|sealed|non-sealed|static)\s+)*(?:class|interface|record|enum|@interface)\s+(\w+)/m;

const publicNames = []; // { name, file }
for (const entry of webEntries) {
  const file = join(root, "web/roux-web/src", entry, "index.ts");
  if (!existsSync(file)) {
    problems.push(`missing entry point: ${rel(file)}`);
    continue;
  }
  for (const name of webExports(file)) publicNames.push({ name, file });
}
for (const module of readdirSync(join(root, "runtime")).sort()) {
  const src = join(root, "runtime", module, "src/main/java");
  if (!existsSync(src)) continue;
  for (const file of javaFiles(src).sort()) {
    const match = javaType.exec(readFileSync(file, "utf8"));
    if (match && !excludedJava.has(match[1])) publicNames.push({ name: match[1], file });
  }
}

function backtickNames(dir) {
  const names = new Set();
  for (const file of markdownFiles(dir)) {
    const text = readFileSync(join(dir, file), "utf8");
    for (const [, span] of text.matchAll(/`([^`\n]+)`/g)) {
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
const javaNames = new Set(publicNames.filter(({ file }) => file.endsWith(".java")).map(({ name }) => name));
for (const reference of markdownFiles(referencesDir)) {
  const text = readFileSync(join(referencesDir, reference), "utf8");
  for (const [, body, sub] of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']@jwcarman\/roux-web\/([\w/-]+)["']/g)) {
    const exported = webNames.get(sub);
    for (const item of body.split(",")) {
      const name = item.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (name && !exported?.has(name)) problems.push(`unknown import in ${reference}: ${name} from ${sub}`);
    }
  }
  for (const [, fqcn, type] of text.matchAll(/import\s+(?:static\s+)?(org\.jwcarman\.roux\.[\w.]*?\.([A-Z]\w*))(?:\.\w+)?\s*;/g)) {
    if (!javaNames.has(type) && !excludedJava.has(type)) problems.push(`unknown import in ${reference}: ${fqcn}`);
  }
}

if (problems.length > 0) {
  for (const line of problems) console.log(line);
  process.exit(1);
}
console.log(`ok: ${publicNames.length} public names documented in guides and references`);
