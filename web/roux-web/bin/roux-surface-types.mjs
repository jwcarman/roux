#!/usr/bin/env node
// Writes each surface's types: `roux-surface-types [--check] <file.surface.json>...`. All the logic is
// runSurfaceTypes in the built package; this file only gives it the real file system and the exit code.
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { runSurfaceTypes } from "../dist/a2ui/index.js";

const io = {
  read: (path) => {
    try {
      return readFileSync(path, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
  },
  write: (path, text) => writeFileSync(path, text),
  log: (line) => process.stdout.write(`${line}\n`),
  error: (line) => process.stderr.write(`${line}\n`),
};

process.exitCode = runSurfaceTypes(process.argv.slice(2), io);
