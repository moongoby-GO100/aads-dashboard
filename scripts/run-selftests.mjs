#!/usr/bin/env node
// Compiles every src/**/*.selftest.ts and runs it, so the chat regression
// selftests can be enforced as a CI gate (WP00 harness, chat-modernization-20260912).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function collect(dir, suffix) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...collect(full, suffix));
    else if (entry.endsWith(suffix)) found.push(full);
  }
  return found;
}

const sources = collect(path.join(root, "src"), ".selftest.ts").sort();
if (sources.length === 0) {
  console.error("no *.selftest.ts found under src/");
  process.exit(1);
}

const outDir = mkdtempSync(path.join(tmpdir(), "aads-selftest-"));
try {
  execFileSync(
    "npx",
    [
      "tsc",
      ...sources,
      "--outDir", outDir,
      "--module", "commonjs",
      "--target", "es2020",
      "--moduleResolution", "node",
      "--skipLibCheck",
    ],
    { cwd: root, stdio: "inherit" },
  );

  const compiled = collect(outDir, ".selftest.js").sort();
  const failures = [];
  for (const file of compiled) {
    const label = path.relative(outDir, file);
    try {
      execFileSync("node", [file], { stdio: "inherit" });
    } catch {
      failures.push(label);
    }
  }

  console.log(`\nselftest: ${compiled.length - failures.length}/${compiled.length} files passed`);
  if (failures.length > 0) {
    console.error(`FAIL: ${failures.join(", ")}`);
    process.exit(1);
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
