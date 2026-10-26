// Mock-only contract tests; no live requests or application server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(file, imports, fetch) {
  const exports = {};
  const js = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(js, { exports, require: name => imports[name], fetch, process: { env: {} }, URLSearchParams, DOMException });
  return exports;
}
const logic = load('src/lib/aagOperations.ts', {});
const target = { project: 'AADS', repositoryId: 'aads-dashboard', targetRef: 'refs/heads/main', severity: '', finding: '' };
const fixture = { nodes: [], edges: [], snapshot_id: 'mock-snapshot', repository_id: target.repositoryId, target_ref: target.targetRef, resolved_commit_sha: 'mock-sha', truncated: false, limitations: [], conclusion: 'observed only' };
function api(fetch) {
  return load('src/lib/aagOperationsApi.ts', { '@/lib/api': { getAuthHeaders: () => ({ Authorization: 'Bearer mock-session' }) }, '@/lib/aagOperations': logic }, fetch);
}
test('impact query encodes full target, default depth and optional governance scope', () => {
  const a = api();
  const u = new URL(a.impactUrl(target, { path: 'src/a b.ts', governanceScope: 'team/one' }));
  assert.equal(u.pathname, '/api/v1/aag/v2/impact');
  assert.deepEqual(Object.fromEntries(u.searchParams), { project: 'AADS', repository_id: 'aads-dashboard', target_ref: 'refs/heads/main', path: 'src/a b.ts', depth: '2', governance_scope: 'team/one' });
  for (const depth of [0, 6, 1.5, NaN]) assert.throws(() => a.impactUrl(target, { path: 'a', depth }));
});
test('impact uses existing authentication, telemetry and cancellation signal', async () => {
  const ctl = new AbortController();
  const a = api(async (_url, options) => {
    assert.equal(options.signal, ctl.signal);
    assert.equal(options.credentials, 'include');
    assert.equal(options.headers.Authorization, 'Bearer mock-session');
    assert.equal(options.headers['X-AAG-Consumer'], 'dashboard-aag-operations');
    return { ok: true, status: 200, json: async () => fixture };
  });
  assert.equal((await a.aagApi.getImpact(target, { path: 'a' }, ctl.signal)).snapshot_id, 'mock-snapshot');
});
test('impact rejects malformed or mismatched target responses', async () => {
  for (const body of [{}, { ...fixture, repository_id: 'other' }, { ...fixture, target_ref: 'refs/heads/other' }]) {
    const a = api(async () => ({ ok: true, status: 200, json: async () => body }));
    await assert.rejects(a.aagApi.getImpact(target, { path: 'a' }), e => e.view.status === 502);
  }
});
test('impact maps HTTP and network errors through existing classifier', async () => {
  for (const [status, kind] of [[401, 'auth'], [403, 'forbidden'], [404, 'not_scanned'], [503, 'server']]) {
    const a = api(async () => ({ ok: false, status, json: async () => ({}) }));
    await assert.rejects(a.aagApi.getImpact(target, { path: 'a' }), e => e.view.kind === kind);
  }
  const a = api(async () => { throw new Error('offline'); });
  await assert.rejects(a.aagApi.getImpact(target, { path: 'a' }), e => e.view.kind === 'network');
});
test('impact abort propagates without becoming a network failure', async () => {
  const a = api(async () => { throw new DOMException('aborted', 'AbortError'); });
  await assert.rejects(a.aagApi.getImpact(target, { path: 'a' }), e => e.name === 'AbortError' && !e.view);
});

// Render the same result component used by ImpactPanel, after contract validation.
test('all unknown node and edge kinds render as strings in React', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const exports = {};
  const js = ts.transpileModule(readFileSync('src/components/aag/ImpactPanel.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(js, { exports, require: name => {
    if (name === '@/lib/aagOperations') return logic;
    if (name === '@/lib/aagOperationsApi' || name === './AagParts') return {};
    return require(name);
  } });
  for (const kind of ['__proto__', 'constructor', 'toString', 'unknown-kind']) {
    const data = { ...fixture, nodes: [{ id: 'a', kind, distance: 0 }], edges: [{ from: 'a', to: 'b', kind }] };
    assert.equal(logic.isImpact(data), true);
    assert.equal(logic.impactKindLabel(kind), `기타 관계·대상 (${kind})`);
    const html = renderToStaticMarkup(React.createElement(exports.ImpactResults, { data }));
    assert.equal(html.split(`기타 관계·대상 (${kind})`).length - 1, 2);
  }
  assert.equal(logic.impactKindLabel('calls'), '호출 관계');
});
