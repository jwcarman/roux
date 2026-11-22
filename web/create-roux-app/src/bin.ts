#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { main } from "./cli.js";

process.exitCode = main(process.argv.slice(2), {
  // The template ships beside dist/ in this package.
  template: fileURLToPath(new URL("../template", import.meta.url)),
  cwd: process.cwd(),
  git: (args, cwd) => spawnSync("git", args, { cwd, stdio: "ignore" }).status === 0,
  out: (line) => console.log(line),
  err: (line) => console.error(line),
});
