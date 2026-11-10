import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSource, source, pagePath, loadPageFunctions } from './source-loader.mjs';
const { ChatModelSaveQueue } = loadSource('src/lib/chatModelSave.ts');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
for (const fail of [false, true]) test(`rapid A → B serializes DB writes after A ${fail ? 'failure' : 'success'}`, async () => {
  const queue = new ChatModelSaveQueue(); const a = deferred(); const b = deferred(); const calls = [];
  const first = queue.save('s', 'provider:A', () => {calls.push('A');return a.promise;}, () => {});
  const second = queue.save('s', 'provider:B', () => {calls.push('B');return b.promise;}, () => {});
  await new Promise(resolve => setTimeout(resolve, 0)); assert.deepEqual(calls, ['A']);
  if (fail) a.reject(Error('offline'));
  else a.resolve();
  await first;
  assert.equal(queue.get('s').model, 'provider:B'); assert.equal(queue.get('s').status, 'saving');
  b.resolve(); await second; assert.deepEqual(calls, ['A','B']); assert.equal(queue.get('s').status, 'saved');
});
test('session switches isolate late errors; retry retains the exact provider scoped choice', async () => {
  const queue = new ChatModelSaveQueue(); const a = deferred();
  const pending = queue.save('old', 'codex:chosen', () => a.promise, () => {});
  await queue.save('new', 'other', async () => {}, () => {});
  a.reject(Error('offline')); await pending;
  assert.equal(queue.get('new').status, 'saved'); assert.equal(queue.get('old').status, 'error');
  await queue.save('old', queue.get('old').model, async () => {}, () => {});
  assert.equal(queue.get('old').model, 'codex:chosen'); assert.equal(queue.get('old').status, 'saved');
});
test('catalog events cannot persist replacements; send captures the selected override', () => {
  const page = source(pagePath);
  assert.doesNotMatch(page, /current_model: fallbackModel/);
  assert.match(page, /modelSaveQueue.current.pendingModel\(activeSession.id\)/);
  assert.match(page, /selection.status !== "saved"/);
  assert.match(page, /const sendModel = modelRef.current/);
  assert.equal((page.match(/model_override: sendModel/g) || []).length, 2);
  assert.match(page, /다시 저장/); assert.match(page, /목록 재시도/);
});

test('provider-scoped identity survives catalog alias collisions', () => {
  const { normalizeModelIdForSelector } = loadPageFunctions(['normalizeModelIdForSelector']);
  for (const catalog of [new Map(), new Map([['openai:shared', 'shared'], ['shared', 'other']])]) {
    assert.equal(normalizeModelIdForSelector('openai:shared', catalog), 'openai:shared');
  }
});
test('hung writes time out, abort and release the queue for retry', async () => {
  const queue = new ChatModelSaveQueue(10); let signal;
  await queue.save('s', 'openai:shared', (value) => { signal = value; return new Promise(() => {}); }, () => {});
  assert.equal(signal.aborted, true);
  assert.equal(queue.get('s').status, 'error');
  await queue.save('s', 'openai:shared', async () => {}, () => {});
  assert.equal(queue.get('s').status, 'saved');
  assert.equal(queue.pendingModel('s'), undefined);
});
test('late timed out completion cannot replace a later choice', async () => {
  const queue = new ChatModelSaveQueue(10); const stale = deferred();
  const first = queue.save('s', 'A', () => stale.promise, () => {});
  const second = queue.save('s', 'B', async () => {}, () => {});
  await Promise.all([first, second]); stale.resolve(); await Promise.resolve();
  assert.equal(queue.get('s').model, 'B');
  assert.equal(queue.pendingModel('s'), undefined);
});

const { saveChatModelFenced } = loadSource('src/lib/chatModelSave.ts');
test('timed-out A cannot overwrite B in the DB when A is processed late', async () => {
  const queue = new ChatModelSaveQueue(30);
  const release = deferred(); let db = { current_model: 'initial', updated_at: 'v0' }; let version = 0;
  const writes = [];
  const request = async (_path, opts) => {
    if (opts.method !== 'PUT') return { ...db };
    const body = JSON.parse(opts.body); writes.push(body);
    if (body.current_model === 'A') await release.promise; // abort does not cancel server processing
    if (body.expected_updated_at !== db.updated_at) throw Object.assign(Error('conflict'), { status: 409 });
    db = { current_model: body.current_model, updated_at: `v${++version}` };
    return { ...db, model_selection_guard: true };
  };
  await queue.save('s', 'A', signal => saveChatModelFenced('s', 'A', signal, request), () => {});
  assert.equal(queue.get('s').status, 'error');
  await queue.save('s', 'B', signal => saveChatModelFenced('s', 'B', signal, request), () => {});
  release.resolve(); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(db.current_model, 'B');
  assert.equal(queue.get('s').status, 'saved');
  assert.equal(writes.filter(w => w.current_model === 'A').length, 1);
});
test('CAS conflict retries with fresh version; unfenced old APIs cannot report saved', async () => {
  let reads = 0, writes = 0;
  const request = async (_path, opts) => {
    if (opts.method !== 'PUT') return { updated_at: `v${++reads}` };
    const body = JSON.parse(opts.body); writes++;
    if (writes === 1) throw Object.assign(Error('conflict'), { status: 409 });
    assert.equal(body.expected_updated_at, 'v2');
    return { current_model: 'openai:shared', updated_at: 'v3', model_selection_guard: true };
  };
  const controller = new AbortController();
  const saved = await saveChatModelFenced('s', 'openai:shared', controller.signal, request);
  assert.equal(saved.current_model, 'openai:shared'); assert.equal(writes, 2);
  await assert.rejects(saveChatModelFenced('s', 'x', controller.signal, async (_p, o) =>
    o.method === 'PUT' ? {current_model:'x'} : {updated_at:'v1'}), /모델 저장을 확인/);
});
