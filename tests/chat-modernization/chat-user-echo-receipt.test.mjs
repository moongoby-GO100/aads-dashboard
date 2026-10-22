import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPageFunctions } from './source-loader.mjs';

const { mergeServerMessagesPreservingLocal: merge, promoteUserEchoByReceipt: promote } = loadPageFunctions([
  'mergeServerMessagesPreservingLocal', 'promoteUserEchoByReceipt',
]);
const user = (id, content, second, extra = {}) => ({ id, session_id: 'session-a', role: 'user', content,
  created_at: new Date(Date.UTC(2026, 9, 22, 9, 0, second)).toISOString(), ...extra });

test('request identity reconciles delayed saves across other pending instructions', () => {
  const first = user('tmp-first', '먼저 확인', 1, { idempotency_key: 'request-first' });
  const second = user('tmp-second', '다음 확인', 2, { idempotency_key: 'request-second' });
  const savedFirst = user('saved-first', first.content, 3, { idempotency_key: first.idempotency_key });
  const savedSecond = user('saved-second', second.content, 4, { idempotency_key: second.idempotency_key });
  const result = merge([first, second], [savedFirst, savedSecond]);
  assert.equal(result.length, 2);
  assert.equal(result.find(m => m.id === savedFirst.id)?.render_id, first.id);
  assert.equal(result.find(m => m.id === savedSecond.id)?.render_id, second.id);
});

test('request identity repairs a duplicate whose saved copy arrived in an earlier poll', () => {
  const echo = user('tmp-first', '한 번 보낸 지시', 1, { idempotency_key: 'request-first' });
  const saved = user('saved-first', echo.content, 2, { idempotency_key: echo.idempotency_key });
  const result = merge([echo, saved], [saved]);
  assert.equal(result.length, 1);
  assert.equal(result[0].render_id, echo.id);
});

test('different request keys preserve an intentional repeat even when clocks coincide', () => {
  const saved = user('saved-first', '같은 문구', 1, { idempotency_key: 'request-first' });
  const echo = user('tmp-second', saved.content, 1, { idempotency_key: 'request-second' });
  assert.equal(merge([echo], [saved]).length, 2);
});

test('request identity survives client clock skew and changed attachment display text', () => {
  const echo = user('tmp-first', '파일 확인 📎 1개 파일', 0, { idempotency_key: 'request-first' });
  const between = user('other', '이전 지시', 10);
  const saved = user('saved-first', '파일 확인', 20, { idempotency_key: echo.idempotency_key });
  const result = merge([echo, between], [between, saved]);
  assert.equal(result.length, 2);
  assert.equal(result.find(m => m.id === saved.id)?.render_id, echo.id);
});

test('interrupt receipt collapses a poll-first duplicate and preserves original render identity', () => {
  const echo = user('interrupt-first', '추가 확인', 1, { render_id: 'echo-key', attachmentPreviews: ['blob:preview'] });
  const other = user('interrupt-second', '또 확인', 2);
  const saved = user('saved-first', '[추가 지시] 추가 확인', 3, { intent: 'interrupt_applied' });
  const result = promote([echo, other, saved], echo.id, echo.session_id, saved.id);
  assert.equal(result.length, 2);
  const actual = result.find(m => m.id === saved.id);
  assert.equal(actual.render_id, 'echo-key');
  assert.equal(actual.content, saved.content);
  assert.equal(actual.attachmentPreviews[0], 'blob:preview');
  assert.deepEqual(promote(result, echo.id, echo.session_id, saved.id), result);
});

test('a receipt never changes another session or assistant bubble', () => {
  const echo = user('interrupt-first', '추가 확인', 1);
  assert.deepEqual(promote([echo], echo.id, 'other-session', 'saved'), [echo]);
  const assistant = { ...echo, role: 'assistant' };
  assert.deepEqual(promote([assistant], assistant.id, assistant.session_id, 'saved'), [assistant]);
});

test('an existing keyed message cannot absorb a new legacy interrupt of identical text', () => {
  const saved = user('saved-first', '같은 지시', 1, { idempotency_key: 'request-first' });
  const echo = user('interrupt-next', saved.content, 2);
  assert.equal(merge([saved, echo], [saved]).length, 2);
});

test('render projections without a receipt key cannot consume a keyed pending repeat', () => {
  const saved = user('saved-first', '같은 지시', 1);
  const echo = user('tmp-second', saved.content, 1, { idempotency_key: 'request-second' });
  assert.equal(merge([echo], [saved]).length, 2);
});
