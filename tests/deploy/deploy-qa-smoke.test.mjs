// 2026-11-05: 대시보드 QA 합격 판정은 실제 브라우저 스모크 점검이다.
// full-qa verdict("CEO 확인 요청")가 판정을 정하면 배포마다 "미확정"으로 끝난다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const deploy = readFileSync(new URL("../../deploy.sh", import.meta.url), "utf8");

test("QA 판정은 스모크 결과로 정해지고 디자인 감리는 참고로만 붙는다", () => {
  assert.match(deploy, /scripts\/post_deploy_smoke\.py/);
  assert.match(deploy, /"SMOKE PASS"\*\) QA_RESULT="PASS/);
  assert.match(deploy, /"SMOKE FAIL"\*\) QA_RESULT="FAIL/);
  assert.match(deploy, /\(참고\)/);
});

test("토큰은 argv 가 아니라 환경변수로만 넘긴다", () => {
  assert.match(deploy, /AADS_SMOKE_TOKEN="\$\{QA_TOKEN:-\}" timeout 240 python3/);
  assert.doesNotMatch(deploy, /post_deploy_smoke\.py"?\s+"?\$\{?QA_TOKEN/);
});

test("스모크 스크립트는 토큰이 없으면 점검 불가(2)로 끝난다", () => {
  const r = spawnSync("python3", [new URL("../../scripts/post_deploy_smoke.py", import.meta.url).pathname],
    { env: { ...process.env, AADS_SMOKE_TOKEN: "" }, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /SMOKE ERROR/);
});
