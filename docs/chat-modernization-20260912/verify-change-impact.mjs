#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const docsRoot = path.join(repositoryRoot, "docs/chat-modernization-20260912");
const manifestPath = path.join(docsRoot, "change-impact.json");
const prTemplatePath = path.join(repositoryRoot, ".github/pull_request_template.md");
const REQUIRED_TEMPLATE_HEADINGS = [
  "Problem trigger",
  "Traceability IDs",
  "Changed behavior",
  "Affected imports and endpoints",
  "DB and API compatibility",
  "Verification evidence",
  "Telemetry and privacy",
  "Feature flag and rollback",
  "Remaining limitations",
  "Documentation updates",
  "Temporary hotfix lifecycle"
];
const IMPACT_PATH_PREFIXES = ["src/app/chat/", "src/features/chat/", "tests/chat-modernization/"];
const IMPACT_FILES = new Set(["package.json", ".github/workflows/chat-regression.yml"]);

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (file) => fs.readFileSync(path.join(repositoryRoot, file), "utf8");
const definedIds = () => {
  const ids = new Set();
  const sources = [
    ["docs/chat-modernization-20260912/PRD.md", /^\| ((?:N?FR)\d{2}) \|/gm],
    ["docs/chat-modernization-20260912/TECHNICAL-DESIGN.md", /^\| ((?:INV|ADR)\d{2}) \|/gm],
    ["docs/chat-modernization-20260912/VERIFICATION-AND-ROLLOUT.md", /^\| ((?:T|WP)\d{2}) \|/gm],
  ];
  for (const [file, pattern] of sources) {
    for (const match of text(file).matchAll(pattern)) ids.add(match[1]);
  }
  return ids;
};

function nonEmptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.trim());
}

export function verifyChangeImpact({ manifest, template, changedFiles = [], root = repositoryRoot }) {
  const errors = [];
  if (!isRecord(manifest) || manifest.schema_version !== 1 || !Array.isArray(manifest.entries)) {
    return ["change-impact.json: expected schema_version=1 and entries array"];
  }
  const ids = root === repositoryRoot ? definedIds() : new Set([
    "FR37", "FR38", "FR41", "INV15", "T37", "T38", "T41"
  ]);
  const seen = new Set();
  for (const [index, entry] of manifest.entries.entries()) {
    const at = `entries[${index}]`;
    if (!isRecord(entry)) { errors.push(`${at}: expected object`); continue; }
    for (const key of ["change_id", "title", "owner", "status", "source_version", "trigger", "telemetry_change", "rollback"]) {
      if (typeof entry[key] !== "string" || !entry[key].trim()) errors.push(`${at}.${key}: required non-empty string`);
    }
    if (seen.has(entry.change_id)) errors.push(`${at}.change_id: duplicate ${entry.change_id}`);
    seen.add(entry.change_id);
    if (!/^[0-9a-f]{7,40}$/.test(entry.source_version || "")) errors.push(`${at}.source_version: expected Git SHA`);
    if (!["planned", "implemented", "verified", "released"].includes(entry.status)) errors.push(`${at}.status: unsupported status`);
    for (const field of ["requirements", "invariants", "tests"]) {
      if (!nonEmptyStrings(entry[field])) errors.push(`${at}.${field}: required non-empty ID list`);
      else for (const id of entry[field]) if (!ids.has(id)) errors.push(`${at}.${field}: unresolved ID ${id}`);
    }
    for (const field of ["affected_paths", "documentation"]) {
      if (!nonEmptyStrings(entry[field])) errors.push(`${at}.${field}: required non-empty path list`);
      else for (const file of entry[field]) {
        if (path.isAbsolute(file) || file.split("/").includes("..")) errors.push(`${at}.${field}: unsafe path ${file}`);
        else if (!fs.existsSync(path.join(root, file))) errors.push(`${at}.${field}: missing path ${file}`);
      }
    }
    if (!isRecord(entry.temporary_hotfix) || typeof entry.temporary_hotfix.enabled !== "boolean") {
      errors.push(`${at}.temporary_hotfix.enabled: required boolean`);
    } else if (entry.temporary_hotfix.enabled) {
      for (const key of ["owner", "expires_on", "removal_condition"]) {
        if (typeof entry.temporary_hotfix[key] !== "string" || !entry.temporary_hotfix[key].trim()) {
          errors.push(`${at}.temporary_hotfix.${key}: required when enabled`);
        }
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.temporary_hotfix.expires_on || "")) {
        errors.push(`${at}.temporary_hotfix.expires_on: expected YYYY-MM-DD`);
      }
    }
  }
  for (const heading of REQUIRED_TEMPLATE_HEADINGS) {
    if (!template.includes(`## ${heading}`)) errors.push(`pull request template: missing heading ${heading}`);
  }
  const impacted = changedFiles.filter((file) => IMPACT_FILES.has(file) || IMPACT_PATH_PREFIXES.some((prefix) => file.startsWith(prefix)));
  if (impacted.length) {
    if (!changedFiles.includes("docs/chat-modernization-20260912/change-impact.json")) {
      errors.push("changed chat/CI code requires docs/chat-modernization-20260912/change-impact.json update");
    }
    const covered = new Set(manifest.entries.flatMap((entry) => isRecord(entry) && Array.isArray(entry.affected_paths) ? entry.affected_paths : []));
    for (const file of impacted) if (!covered.has(file)) errors.push(`changed path has no change-impact owner: ${file}`);
  }
  return errors;
}

export function changedFilesFromGit(base) {
  if (!base) return [];
  try {
    return execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).split(/\r?\n/).filter(Boolean);
  } catch {
    return ["__CHANGE_BASE_UNAVAILABLE__"];
  }
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const template = fs.readFileSync(prTemplatePath, "utf8");
  const base = process.env.CHAT_CHANGE_BASE || "";
  const changedFiles = changedFilesFromGit(base);
  const errors = changedFiles.includes("__CHANGE_BASE_UNAVAILABLE__")
    ? [`unable to compare CHAT_CHANGE_BASE ${base}; checkout full history and provide a valid base SHA`]
    : verifyChangeImpact({ manifest, template, changedFiles });
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${manifest.entries.length} change-impact entries, ${changedFiles.length} changed paths checked`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

