import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);

// 실제 운영 모듈(approvalDecision.ts, ApprovalHighRisk.tsx)을 그대로 번들해 격리 하네스에서 실행한다.
// 서버는 page.route 목(mock)이며 운영 API/세션/JWT 를 쓰지 않는다.
function browserScript() {
  const modules = new Map();
  const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  function bundle(file, transpile) {
    if (modules.has(file)) return modules.get(file).id;
    const entry = { id: modules.size, code: '' }; modules.set(file, entry);
    const resolveFrom = createRequire(file);
    entry.code = (transpile ? compile(file) : fs.readFileSync(file, 'utf8')).replace(/require\(['"]([^'"]+)['"]\)/g, (_, name) => {
      if (name === '@/lib/approvalDecision') return `R(${bundle(require.resolve('../../src/lib/approvalDecision.ts'), true)})`;
      return `R(${bundle(resolveFrom.resolve(name), false)})`;
    });
    return entry.id;
  }
  const rid = bundle(require.resolve('react'), false);
  const did = bundle(require.resolve('react-dom/client'), false);
  const pid = bundle(require.resolve('react-dom'), false);
  const cid = bundle(new URL('../../src/components/chat/ApprovalHighRisk.tsx', import.meta.url).pathname, true);
  const lid = bundle(new URL('../../src/lib/approvalDecision.ts', import.meta.url).pathname, true);
  const app = ts.transpileModule(`
const {useState,useRef}=React;
const {ApprovalCardError,HighRiskConfirmDialog}=Lib;
const {runApprovalDecision,enqueueHighRisk}=Dec;
const GRANT={scope:'single',hours:2,max:1};
window.posts=[];
const post=async(path)=>{window.posts.push(path);const r=await fetch('/mock'+path,{method:'POST'});if(!r.ok)throw Object.assign(new Error(r.status+': '+await r.text()),{status:r.status});return r.json();};
function App(){
 const [cards,setCards]=useState([{id:'hr1',tool:'approve_work_recipe_registration',summary:'aligo_01_login_to_mfa (합성 카드)',risk:'high'},{id:'ok2',tool:'run_x',summary:'일반 승인 합성',risk:'low'}]);
 const [errs,setErrs]=useState({});const [queue,setQueue]=useState([]);const [busy,setBusy]=useState(false);const inflight=useRef(new Set());
 const epoch=useRef(0);window.bumpEpoch=()=>{epoch.current++;setQueue(q=>q.filter(x=>x.epoch===epoch.current));};
 async function decide(id,decision,confirm){
  if(inflight.current.has(id))return;inflight.current.add(id);
  const card=cards.find(c=>c.id===id);const ep=epoch.current;
  try{const r=await runApprovalDecision(post,{id,decision,grant:GRANT,confirmHighRisk:confirm});
   if(ep!==epoch.current)return;
   if(r.status==='ok'){setCards(cs=>cs.filter(c=>c.id!==id));setErrs(e=>{const n={...e};delete n[id];return n;});}
   else if(r.status==='needs_confirm'){setQueue(q=>enqueueHighRisk(q,{id,epoch:ep,scope:'single',tool:card.tool,summary:card.summary,risk:card.risk}));}
   else setErrs(e=>({...e,[id]:r.failure.message}));
  }finally{inflight.current.delete(id);}
 }
 const head=queue[0];
 return <main style={{display:'flex',flexDirection:'row',height:'100vh'}}>
  <div style={{flex:1,minWidth:0,padding:8}}>
   <div data-chat-input contentEditable suppressContentEditableWarning>입력 보존</div>
   {cards.map(c=><section key={c.id} data-card={c.id} style={{border:'1px solid #999',padding:8,margin:'8px 0',minWidth:0}}>
     <b>{c.tool}</b><div>{c.summary}</div>
     <button disabled={false} onClick={()=>decide(c.id,'approved',false)} style={{minHeight:44}}>승인 {c.id}</button>
     <button onClick={()=>decide(c.id,'rejected',false)} style={{minHeight:44}}>반려 {c.id}</button>
     <ApprovalCardError message={errs[c.id]}/>
   </section>)}
  </div>
  {head&&<HighRiskConfirmDialog request={head} pendingCount={queue.length} busy={busy}
    onCancel={()=>setQueue(q=>q.filter(x=>x.id!==head.id))}
    onConfirm={async()=>{setBusy(true);try{await decide(head.id,'approved',true);}finally{setBusy(false);}setQueue(q=>q.filter(x=>x.id!==head.id));}}/>}
 </main>;
}
ReactClient.createRoot(document.getElementById('root')).render(<App/>);`, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  return `const process={env:{NODE_ENV:'production'}};const M={${[...modules.values()].map(m => `${m.id}:function(module,exports,R){${m.code}\n}`).join(',')}};const C={};function R(id){if(C[id])return C[id].exports;const m=C[id]={exports:{}};M[id](m,m.exports,R);return m.exports;}
const React=R(${rid}),ReactClient=R(${did}),ReactDOM=R(${pid}),Lib=R(${cid}),Dec=R(${lid});${app}`;
}

const LONG = JSON.stringify({ detail: 'x'.repeat(400) });


test('고위험 재확인: 409→대화상자→확인→confirm_high_risk=true / 취소 / 오류 격리 (desktop+mobile)', { timeout: 120000 }, async () => {
  const { chromium } = require(process.env.AADS_PLAYWRIGHT_MODULE || 'playwright-core');
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.AADS_CHROMIUM_PATH ? { executablePath: process.env.AADS_CHROMIUM_PATH } : {}) });
  const script = browserScript();
  try {
    for (const width of [1440, 390]) {
      const html = '<meta charset="utf-8"><style>:root{--ct-text:#111827;--ct-text2:#374151;--ct-border:#d1d5db;--ct-bg:#fff}body{margin:0;font-family:sans-serif}</style><div id="root"></div>';
      const mk = async handler => {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        const hits = [];
        await page.route('**/mock/**', route => {
          const u = new URL(route.request().url()); hits.push(decodeURIComponent(u.pathname + u.search));
          const r = handler(u); route.fulfill({ status: r.status, contentType: 'application/json', body: r.body, headers: { 'access-control-allow-origin': '*' } });
        });
        await page.route('http://harness.test/', route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
        await page.goto('http://harness.test/');
        await page.addScriptTag({ content: script });
        return { page, errors, hits };
      };
      const highRiskServer = u => u.pathname.includes('/hr1/') && !u.search.includes('confirm_high_risk=true')
        ? { status: 409, body: '{"detail":"high_risk_confirmation_required"}' } : { status: 200, body: '{"ok":true}' };

      // 1) 409 → 대화상자 → 확인 → true 1회
      {
        const { page, errors, hits } = await mk(highRiskServer);
        await page.locator('[data-chat-input]').fill('보존할 입력');
        await page.getByRole('button', { name: '승인 hr1' }).click();
        const dialog = page.getByRole('dialog'); await dialog.waitFor();
        assert.match(await dialog.innerText(), /외부 쓰기 포함 — 다시 확인/);
        assert.equal(hits.length, 1); assert.ok(!hits[0].includes('confirm_high_risk'));
        await page.screenshot({ path: `/tmp/aads-high-risk-dialog-${width}.png`, fullPage: true });
        const box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width);
        await dialog.getByRole('button', { name: /외부 쓰기를 확인하고 승인/ }).click();
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(hits.length, 2); assert.ok(hits[1].includes('confirm_high_risk=true'));
        assert.equal(hits.filter(h => h.includes('/ok2/')).length, 0, '다른 카드는 호출되지 않는다');
        assert.equal(await page.locator('[data-card=hr1]').count(), 0);
        assert.equal(await page.locator('[data-card=ok2]').count(), 1);
        assert.equal(await page.locator('[data-chat-input]').innerText(), '보존할 입력');
        assert.deepEqual(errors, []); await page.close();
      }
      // 2) 취소 → 재호출 0, 카드 유지
      {
        const { page, hits } = await mk(highRiskServer);
        await page.getByRole('button', { name: '승인 hr1' }).click();
        const dialog = page.getByRole('dialog'); await dialog.waitFor();
        await dialog.getByRole('button', { name: /취소/ }).click(); await dialog.waitFor({ state: 'hidden' });
        assert.equal(hits.length, 1); assert.equal(await page.locator('[data-card=hr1]').count(), 1); await page.close();
      }
      // 3) Escape 취소 + 더블클릭은 대화상자 하나 / 호출 1회
      {
        const { page, hits } = await mk(highRiskServer);
        await page.getByRole('button', { name: '승인 hr1' }).dblclick();
        await page.getByRole('dialog').waitFor();
        assert.equal(await page.getByRole('dialog').count(), 1); assert.equal(hits.length, 1);
        await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
        assert.equal(hits.length, 1); await page.close();
      }
      // 4) 다른 409 detail → 대화상자 없음, 재시도 없음, 카드 안 role=alert
      {
        const { page, hits } = await mk(() => ({ status: 409, body: '{"detail":"something_else"}' }));
        await page.getByRole('button', { name: '승인 hr1' }).click();
        const alert = page.locator('[data-card=hr1] [role=alert]'); await alert.waitFor();
        assert.equal(await page.getByRole('dialog').count(), 0); assert.equal(hits.length, 1);
        assert.ok(!/\{|detail/.test(await alert.innerText()), '원문 JSON 노출 금지');
        await page.close();
      }
      // 5) 긴 오류 본문 — 카드 안에서 줄바꿈, 가로 넘침 없음, 레이아웃 유지
      {
        const { page, hits } = await mk(() => ({ status: 500, body: LONG }));
        await page.getByRole('button', { name: '승인 ok2' }).click();
        const alert = page.locator('[data-card=ok2] [role=alert]'); await alert.waitFor();
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        assert.ok(sw <= width, `가로 스크롤 없음 (${sw}<=${width})`);
        const ab = await alert.boundingBox(), cb = await page.locator('[data-card=ok2]').boundingBox();
        assert.ok(ab.x >= cb.x - 1 && ab.x + ab.width <= cb.x + cb.width + 1, '오류가 카드 폭 안에 있다');
        await page.screenshot({ path: `/tmp/aads-card-error-${width}.png`, fullPage: true });
        assert.equal(hits.length, 1); await page.close();
      }
      // 6) 일반 승인/반려는 confirm 없이 1회
      {
        const { page, hits } = await mk(() => ({ status: 200, body: '{}' }));
        await page.getByRole('button', { name: '승인 ok2' }).click();
        await page.locator('[data-card=ok2]').waitFor({ state: 'detached' });
        await page.getByRole('button', { name: '반려 hr1' }).click();
        await page.locator('[data-card=hr1]').waitFor({ state: 'detached' });
        assert.equal(hits.length, 2); assert.ok(hits.every(h => !h.includes('confirm_high_risk'))); await page.close();
      }
      // 7) 세션(epoch) 전환 후 확인 요청은 버려져 호출 0
      {
        const { page, hits } = await mk(highRiskServer);
        await page.getByRole('button', { name: '승인 hr1' }).click();
        await page.getByRole('dialog').waitFor();
        await page.evaluate(() => window.bumpEpoch());
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        assert.equal(hits.length, 1); await page.close();
      }
      console.log(JSON.stringify({ width, productionRequests: 0, screenshots: [`/tmp/aads-high-risk-dialog-${width}.png`, `/tmp/aads-card-error-${width}.png`] }));
    }
  } finally { await browser.close(); }
});
