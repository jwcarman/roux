#!/usr/bin/env node
// Guide coverage check. Exits 1 (one line per problem) unless
//  (a) every public roux name (web entry-point exports and public top-level Java types) appears in
//      backticks in some docs/guides/*.md, and
//  (b) plugins/roux/skills/roux/references/ holds exactly docs/guides/*.md minus README.md, byte for byte.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const guidesDir = join(root, "docs/guides");
const referencesDir = join(root, "plugins/roux/skills/roux/references");
const webEntries = ["problem", "api", "paging", "table", "feedback", "form", "dates", "theme", "signin", "navigation"];

// Public but not API: wiring that users never reference by name.
const excludedJava = new Set(["ProblemsRuntimeHints", "ValidationRuntimeHints", "RouxProblemsAutoConfiguration", "RouxAuditingAutoConfiguration", "RouxSpaAutoConfiguration", "RouxThemeAutoConfiguration", "RouxThemePersistenceAutoConfiguration"]);

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

// (a) every name appears inside a backtick span of some guide.
const documented = new Set();
for (const guide of markdownFiles(guidesDir)) {
  const text = readFileSync(join(guidesDir, guide), "utf8");
  for (const [, span] of text.matchAll(/`([^`\n]+)`/g)) {
    for (const [identifier] of span.matchAll(/[A-Za-z_$][\w$]*/g)) documented.add(identifier);
  }
}
const reported = new Set();
for (const { name, file } of publicNames) {
  if (documented.has(name) || reported.has(name)) continue;
  reported.add(name);
  problems.push(`missing from guides: ${name} (${rel(file)})`);
}

// (b) references are byte-for-byte copies of the guides.
const guides = markdownFiles(guidesDir);
const references = markdownFiles(referencesDir);
const allReferenceFiles = existsSync(referencesDir) ? readdirSync(referencesDir).sort() : [];
for (const file of allReferenceFiles) {
  if (!guides.includes(file)) problems.push(`stale reference: ${file}`);
}
for (const file of guides) {
  if (!references.includes(file) || !readFileSync(join(guidesDir, file)).equals(readFileSync(join(referencesDir, file)))) {
    problems.push(`stale reference: ${file}`);
  }
}

if (problems.length > 0) {
  for (const line of problems) console.log(line);
  process.exit(1);
}
console.log(`ok: ${publicNames.length} public names documented, ${guides.length} references current`);
