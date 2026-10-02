import test from "node:test";
import assert from "node:assert/strict";
import {
  nextPollDelay, POLL_BASE_MS, POLL_MAX_MS, taskStatusLabel, canRetry, describePermission, isExpired,
  frameImageSrc, connectionMessage, actionErrorMessage, sortByUpdatedDesc,
} from "../lib/format.js";

test("폴링: 기본 10초, 실패마다 2배, 최대 60초", () => {
  assert.equal(nextPollDelay(0), POLL_BASE_MS);
  assert.equal(nextPollDelay(1), 20_000);
  assert.equal(nextPollDelay(2), 40_000);
  assert.equal(nextPollDelay(3), POLL_MAX_MS);
  assert.equal(nextPollDelay(50), POLL_MAX_MS);
});

test("상태 라벨은 업무명, 알 수 없는 값도 안전", () => {
  assert.equal(taskStatusLabel("running"), "진행 중");
  assert.equal(taskStatusLabel("approval_required"), "승인 필요");
  assert.equal(taskStatusLabel("???"), "알 수 없음");
});

test("재시도 가능 상태", () => {
  assert.equal(canRetry("failed"), true);
  assert.equal(canRetry("running"), false);
  assert.equal(canRetry("approval_required"), false);
});

test("승인 카드 설명: 무엇을·어디서·왜", () => {
  const d = describePermission({ action_summary: "결제 버튼 클릭", origin: "https://shop.example.com", risk_level: "high" });
  assert.equal(d.what, "결제 버튼 클릭");
  assert.equal(d.where, "https://shop.example.com");
  assert.match(d.why, /높음/);
  const fallback = describePermission({ action_type: "click" });
  assert.equal(fallback.what, "click");
  assert.equal(fallback.where, "사이트 정보 없음");
});

test("만료 판정", () => {
  const now = Date.parse("2026-10-03T00:00:00Z");
  assert.equal(isExpired({ expires_at: "2026-10-02T23:59:00Z" }, now), true);
  assert.equal(isExpired({ expires_at: "2026-10-03T00:10:00Z" }, now), false);
  assert.equal(isExpired({}, now), false);
});

test("live-frame 이미지: 허용된 형식만 data URL, 그 외는 차단", () => {
  assert.equal(frameImageSrc({ frame_base64: "QUJD", media_type: "image/png" }), "data:image/png;base64,QUJD");
  assert.equal(frameImageSrc({ frame_base64: "QUJD", media_type: "text/html" }), "");
  assert.equal(frameImageSrc({ frame_base64: "<script>", media_type: "image/png" }), "");
  assert.equal(frameImageSrc({ frame_url: "https://aads.newtalk.kr/x.png" }), "https://aads.newtalk.kr/x.png");
  assert.equal(frameImageSrc({ frame_url: "https://evil.example/x.png" }), "");
  assert.equal(frameImageSrc(null), "");
});

test("연결 상태 메시지는 사람 말, 토큰/내부값 없음", () => {
  assert.equal(connectionMessage({ kind: "auth" }).state, "login");
  assert.match(connectionMessage({ kind: "server" }, 20_000).text, /20초/);
  assert.match(connectionMessage({ kind: "network" }, 40_000).text, /네트워크/);
  assert.match(actionErrorMessage({ kind: "conflict" }, "다시 시도"), /먼저 필요/);
});

test("작업 정렬: 최신 갱신 순", () => {
  const sorted = sortByUpdatedDesc([{ id: "a", updated_at: "2026-10-01T00:00:00Z" }, { id: "b", updated_at: "2026-10-02T00:00:00Z" }]);
  assert.deepEqual(sorted.map((t) => t.id), ["b", "a"]);
});
