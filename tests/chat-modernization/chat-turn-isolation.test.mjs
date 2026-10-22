import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPageFunctions } from './source-loader.mjs';

const { mergeServerMessagesPreservingLocal: merge, reconcileMessagesForActiveStreaming: reconcile,
  replaceStreamingPlaceholderWithFinal: finalize, activeStreamingMessageId, surfaceDbSavedStreamingPlaceholders } = loadPageFunctions([
  'mergeServerMessagesPreservingLocal', 'reconcileMessagesForActiveStreaming', 'replaceStreamingPlaceholderWithFinal',
  'activeStreamingMessageId', 'surfaceDbSavedStreamingPlaceholders',
]);
const msg = (id, content, seconds, extra = {}) => ({
  id, session_id: 'session-a', role: 'assistant', content,
  created_at: new Date(Date.UTC(2026, 9, 16, 7, 0, seconds)).toISOString(), ...extra,
});
const question = msg('question-new', '추가 확인하고 조치해', 10, { role: 'user' });
const old = msg('answer-old', '이전 지시에 대한 완료 응답입니다. '.repeat(12), 2, { execution_id: 'execution-old' });
const draft = msg('ai-streaming-new', '새 지시 처리 중', 11, { intent: 'streaming_placeholder', execution_id: 'execution-new' });

test('history polling cannot move the current draft into the previous answer', () => {
  const result = merge([old, question, draft], [old, question]);
  assert.equal(result.find(m => m.id === draft.id)?.content, draft.content);
  assert.notEqual(result.find(m => m.id === old.id)?.render_id, draft.id);
});

test('legacy messages without execution IDs stay on their side of the user instruction', () => {
  const legacyOld = { ...old, execution_id: undefined };
  const legacyDraft = { ...draft, execution_id: undefined };
  const result = merge([legacyOld, question, legacyDraft], [legacyOld, question]);
  assert.equal(result.find(m => m.id === legacyDraft.id)?.content, draft.content);
  assert.notEqual(result.find(m => m.id === old.id)?.render_id, legacyDraft.id);
});

test('different execution placeholders never copy content or tools into each other', () => {
  const oldDraft = { ...old, id: 'ai-streaming-old', intent: 'streaming_placeholder', tools_called: [{ type: 'tool_use', tool_name: 'old-tool' }] };
  const result = merge([oldDraft, question, draft], [draft]);
  assert.equal(result.find(m => m.execution_id === 'execution-new')?.content, draft.content);
  assert.equal(result.find(m => m.execution_id === 'execution-new')?.tools_called?.[0]?.tool_name, undefined);
  assert.equal(result.find(m => m.execution_id === 'execution-old')?.content, old.content);
});

test('active status for a new execution does not relabel an old draft', () => {
  const oldDraft = { ...old, id: 'ai-streaming-old', intent: 'streaming_placeholder' };
  const result = reconcile([oldDraft, question], { sessionId: 'session-a', executionId: 'execution-new', partialContent: '' });
  assert.equal(result.find(m => m.execution_id === 'execution-old')?.content, old.content);
  assert.notEqual(result.find(m => m.execution_id === 'execution-new')?.content, old.content);
});

test('a late final cannot replace a newer legacy draft across an instruction', () => {
  const legacyDraft = { ...draft, execution_id: undefined };
  const result = finalize([question, legacyDraft], old);
  assert.equal(result.find(m => m.id === legacyDraft.id)?.intent, 'streaming_placeholder');
  assert.equal(result.find(m => m.id === old.id)?.content, old.content);
});

test('identical answers belonging to different executions are both retained', () => {
  const repeated = msg('answer-new', old.content, 12, { execution_id: 'execution-new' });
  const result = merge([old, question], [repeated]);
  assert.deepEqual(new Set(result.filter(m => m.role === 'assistant').map(m => m.execution_id)), new Set(['execution-old', 'execution-new']));
});

test('same-execution UUID promotion preserves partial content and stable identity', () => {
  const saved = { ...draft, id: 'saved-draft', content: '새 지시', render_id: undefined };
  const result = merge([question, draft], [saved]);
  assert.equal(result.filter(m => m.role === 'assistant').length, 1);
  assert.equal(result.find(m => m.id === saved.id)?.content, draft.content);
  assert.equal(result.find(m => m.id === saved.id)?.render_id, draft.id);
});

test('same-execution final still replaces its draft after an additional instruction', () => {
  const extra = msg('extra', '진행 보고도 해줘', 12, { role: 'user' });
  const final = msg('answer-new', '새 지시 처리 완료', 13, { execution_id: draft.execution_id });
  const result = finalize([question, draft, extra], final);
  assert.equal(result.filter(m => m.role === 'assistant').length, 1);
  assert.equal(result.find(m => m.execution_id === final.execution_id)?.content, final.content);
});

test('only the current execution anchor receives the shared live content and controls', () => {
  const oldDraft = { ...old, id: 'ai-streaming-old', intent: 'streaming_placeholder' };
  assert.equal(activeStreamingMessageId([oldDraft, question, draft], 'session-a', 'execution-new'), draft.id);
  assert.equal(activeStreamingMessageId([oldDraft, question], 'session-a', 'execution-new'), undefined);
  assert.equal(activeStreamingMessageId([oldDraft, question, draft], 'other-session', 'execution-new'), undefined);
});

test('database draft hydration cannot borrow a previous execution buffer', () => {
  const empty = { ...draft, content: '' };
  const wrong = surfaceDbSavedStreamingPlaceholders([empty], { keepEmpty: true, fallbackContent: old.content, executionId: old.execution_id });
  assert.notEqual(wrong[0].content, old.content);
  const matching = surfaceDbSavedStreamingPlaceholders([empty], { fallbackContent: draft.content, executionId: draft.execution_id });
  assert.equal(matching[0].content, draft.content);
});

test('server copy of a just-sent instruction replaces its local echo bubble', () => {
  const echo = msg('tmp-1', '버블 확인해', 20, { role: 'user' });
  const saved = msg('user-saved', '버블 확인해', 22, { role: 'user' });
  const result = merge([old, echo], [old, saved]);
  assert.equal(result.filter(m => m.role === 'user').length, 1);
  assert.equal(result.find(m => m.id === saved.id)?.render_id, echo.id);
});

test('additional instruction echo merges with its labelled server copy', () => {
  const echo = msg('interrupt-1', '진행 보고도 해줘', 20, { role: 'user' });
  const saved = msg('user-saved', '[추가 지시] 진행 보고도 해줘', 21, { role: 'user', intent: 'interrupt_queued' });
  const result = merge([question, draft, echo], [question, saved]);
  assert.equal(result.filter(m => m.role === 'user').length, 2);
  assert.equal(result.find(m => m.id === saved.id)?.render_id, echo.id);
});

test('an intentionally repeated instruction keeps both bubbles and stable keys', () => {
  const first = msg('user-1', '다시 확인해', 10, { role: 'user' });
  const echo = msg('tmp-2', '다시 확인해', 20, { role: 'user' });
  const second = msg('user-2', '다시 확인해', 21, { role: 'user' });
  const result = merge([first, echo], [first, second]);
  assert.equal(result.filter(m => m.role === 'user').length, 2);
  assert.notEqual(result.find(m => m.id === first.id)?.render_id, echo.id);
  assert.equal(result.find(m => m.id === second.id)?.render_id, echo.id);
});

test('a pending echo is not absorbed by an earlier identical saved instruction', () => {
  const first = msg('user-1', '다시 확인해', 10, { role: 'user' });
  const echo = msg('tmp-2', '다시 확인해', 20, { role: 'user' });
  const result = merge([first, echo], [first]);
  assert.deepEqual([...result.filter(m => m.role === 'user').map(m => m.id)], [first.id, echo.id]);
});
