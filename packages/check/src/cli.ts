#!/usr/bin/env node
import { resolve } from "node:path";
import { SLOT_NAMES } from "@plinth/core/slots";
import { checkProject } from "./check";

const args = process.argv.slice(2);

if (args[0] !== "check") {
  console.error("Usage: plinth check [--json] [--cwd <directory>]");
  process.exit(2);
}

const cwdFlag = args.indexOf("--cwd");
const root = resolve(cwdFlag >= 0 && args[cwdFlag + 1] ? args[cwdFlag + 1] : process.cwd());
const result = checkProject(root);

if (args.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else if (result.ok) {
  console.log(`✓ plinth check passed — all ${SLOT_NAMES.length} slots intact`);
} else {
  console.error(`✕ plinth check found ${result.issues.length} problem${result.issues.length === 1 ? "" : "s"}:\n`);
  for (const issue of result.issues) {
    const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;
    console.error(`  ${location}  ${issue.code}\n    ${issue.message}\n`);
  }
}

process.exit(result.ok ? 0 : 1);
