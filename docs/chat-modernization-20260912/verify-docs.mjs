#!/usr/bin/env node
// Documentation integrity only. This does not execute product or browser tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = process.env.AADS_WORKSPACE_ROOT;
const declaredCrossRepoLinks = new Set([
  '../../../AGENTS.md',
  '../../../aads-server/.github/workflows/ci.yml',
  '../../../aads-server/HANDOVER.md',
  '../../../aads-server/app/routers/chat.py',
  '../../../aads-server/app/services/chat_service.py',
  '../../../aads-server/app/services/stream_worker.py',
  '../../../aads-server/docs/reports/20260428_CHAT_FEATURE_FULL_AUDIT.md',
  '../../../aads-server/docs/reports/20260506_CHAT_LIGHTWEIGHT_PLAN.md',
  '../../../aads-server/docs/reports/20260506_CHAT_LIGHTWEIGHT_PLAN_v2.md',
  '../../../aads-server/docs/reports/20260506_CHAT_LIGHTWEIGHT_V2.md',
  '../../../aads-server/docs/reports/20260520_CHAT_INPUT_FREEZE_REMEDIATION.md',
  '../../../aads-server/docs/reports/20260728_AADS_STREAM_CONTINUITY_CONTEXT_EXHAUSTION_REPORT.md',
  '../../../aads-server/docs/reports/20260908_chat_interruption_owner_recovery_incident_v2.md',
  '../../../aads-server/pyproject.toml',
  '../../../aads-server/scripts/run_py311_tests.sh',
]);
const files = [
  'README.md', 'CURRENT-CODE-AUDIT.md', 'PRD.md',
  'TECHNICAL-DESIGN.md', 'VERIFICATION-AND-ROLLOUT.md', 'SOURCES.md',
  'implementation/WP00.md',
];
const errors = [];
const docs = new Map();
for (const file of files) {
  try { docs.set(file, fs.readFileSync(path.join(base, file), 'utf8')); }
  catch (error) { errors.push(`${file}: ${error.message}`); }
}
const read = (name) => docs.get(name) || '';
const definitions = (name, pattern) => [...read(name).matchAll(pattern)].map((m) => m[1]);
const groups = [
  ['C', 32, definitions('CURRENT-CODE-AUDIT.md', /^### (C\d{2})\b/gm)],
  ['FR', 44, definitions('PRD.md', /^\| (FR\d{2}) \|/gm)],
  ['NFR', 18, definitions('PRD.md', /^\| (NFR\d{2}) \|/gm)],
  ['INV', 15, definitions('TECHNICAL-DESIGN.md', /^\| (INV\d{2}) \|/gm)],
  ['ADR', 12, definitions('TECHNICAL-DESIGN.md', /^\| (ADR\d{2}) \|/gm)],
  ['T', 44, definitions('VERIFICATION-AND-ROLLOUT.md', /^\| (T\d{2}) \|/gm)],
  ['WP', 11, definitions('VERIFICATION-AND-ROLLOUT.md', /^\| (WP\d{2}) \|/gm)],
  ['W', 32, definitions('SOURCES.md', /^\| (W\d{2}) \|/gm)],
  ['R', 11, definitions('SOURCES.md', /^\| (R\d{2}) \|/gm)],
];
const known = new Set();
for (const [prefix, count, found] of groups) {
  if (found.length !== count) errors.push(`${prefix}: expected ${count} definitions, found ${found.length}`);
  if (new Set(found).size !== found.length) errors.push(`${prefix}: duplicate definition`);
  const start = prefix === 'WP' ? 0 : 1;
  for (let n = start; n < start + count; n++) {
    const id = `${prefix}${String(n).padStart(2, '0')}`;
    if (!found.includes(id)) errors.push(`Missing definition: ${id}`);
  }
  found.forEach((id) => known.add(id));
}
let localLinks = 0;
let declaredExternalLinks = 0;
const slug = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '').trim().replace(/\s/g, '-');
for (const [file, content] of docs) {
  for (const match of content.matchAll(/\b(?:NFR|FR|INV|ADR|WP|C|T|W|R)\d{2}\b/g)) {
    if (!known.has(match[0])) errors.push(`${file}: unresolved ID ${match[0]}`);
  }
  for (const match of content.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
    const href = match[1];
    if (/^(?:https?:|mailto:)/.test(href)) continue;
    const [relative, anchor] = href.split('#');
    const source = path.join(base, file);
    const clean = decodeURIComponent(relative).replace(/:\d+$/, '');
    const linkBase = file.includes('/') ? path.dirname(source) : base;
    let target = relative ? path.resolve(linkBase, clean) : source;
    if (
      relative
      && !file.includes('/')
      && relative.startsWith('../../../')
      && workspaceRoot
      && !fs.existsSync(target)
    ) {
      target = path.resolve(workspaceRoot, relative.slice('../../../'.length));
    }
    localLinks++;
    if (!fs.existsSync(target) && !workspaceRoot && declaredCrossRepoLinks.has(relative)) {
      declaredExternalLinks++;
      continue;
    }
    if (!fs.existsSync(target)) { errors.push(`${file}: missing link ${href}`); continue; }
    if (anchor && target.endsWith('.md')) {
      const headings = [...fs.readFileSync(target, 'utf8').matchAll(/^#{1,6} (.+)$/gm)].map((m) => slug(m[1]));
      if (!headings.includes(decodeURIComponent(anchor))) errors.push(`${file}: missing heading ${href}`);
    }
  }
  if ((content.match(/^```/gm) || []).length % 2) errors.push(`${file}: unbalanced code fence`);
}
const coverage = new Set();
for (const row of read('VERIFICATION-AND-ROLLOUT.md').matchAll(/^\| (T\d{2}) \| (FR\d{2}) \|/gm)) {
  if (coverage.has(row[2])) errors.push(`Duplicate test mapping: ${row[2]}`);
  coverage.add(row[2]);
  if (row[1].slice(1) !== row[2].slice(2)) errors.push(`Unexpected mapping: ${row[1]} -> ${row[2]}`);
}
for (const id of known) if (id.startsWith('FR') && !coverage.has(id)) errors.push(`No test mapping: ${id}`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`PASS: ${docs.size} documents, ${localLinks} links (${declaredExternalLinks} declared cross-repo), ${known.size} IDs, ${coverage.size} FR-to-test mappings`);
}
