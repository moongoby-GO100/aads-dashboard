// Run against the real Next /chat page with synthetic API data; no production writes or LLM calls.
// AADS_CHAT_TEST_URL=http://127.0.0.1:3197 node --test tests/browser/chat-model-selection.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.AADS_PLAYWRIGHT_MODULE || 'playwright-core');

const base = process.env.AADS_CHAT_TEST_URL || 'http://localhost:3197';
const workspace = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const first = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const second = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const session = (id, title, model) => ({ id, title, workspace_id: workspace, current_model: model,
  created_at: '2026-11-10T00:00:00Z', updated_at: '2026-11-10T00:00:00.000001Z',
  pinned: false, tags: [], message_count: 0, cost_total: '0' });
const models = ['openai', 'codex'].map(provider => ({ provider, model_id: 'shared',
  display_name: `${provider} shared`, is_active: true, is_selectable: true, is_executable: true,
  input_cost: 0, output_cost: 0, metadata: {} }));

test('real chat React page preserves selection, save recovery, session switches and send identity', { timeout: 180000 }, async () => {
  const browser = await chromium.launch({headless:true, args:['--no-sandbox'],
    ...(process.env.AADS_CHROMIUM_PATH ? {executablePath:process.env.AADS_CHROMIUM_PATH} : {})});
  try {
    for (const width of [1920, 390]) {
      const context = await browser.newContext({viewport:{width, height:911}});
      await context.addCookies([{name:'aads_token', value:'synthetic-test-only', url:base}]);
      await context.addInitScript(() => localStorage.setItem('aads_token','synthetic-test-only'));
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => { errors.push(e.message); console.error('PAGE_ERROR',e.message); });
      const db = new Map([[first,session(first,'선택 유지 검증','openai:shared')], [second,session(second,'다른 세션 검증','codex:shared')]]);
      const puts = [], sends = []; let catalog = models, catalogReads = 0, fail = false, release, conflicts=0;
      await context.route('**/api/v1/**', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1','');
        const reply = opts => route.fulfill({headers:{'Access-Control-Allow-Origin':new URL(base).origin,'Access-Control-Allow-Methods':'GET,PUT,POST,OPTIONS','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Credentials':'true'},...opts});
        if(request.method()==='OPTIONS') return reply({status:204});
        let data;
        if (path === '/auth/me') data = {user_id:'fixture',email:'fixture@example.test',is_admin:true};
        else if (path === '/chat/workspaces') data = [{id:workspace,name:'모델 선택 테스트',icon:'',color:'#3182ce',project_key:'AADS'}];
        else if (path === '/chat/sessions') data = [...db.values()];
        else if (path === '/chat/session-attention') data={items:[],working_count:0,completed_unread_count:0};
        else if (/^\/chat\/sessions\/[^/]+$/.test(path)) {
          const id=path.split('/').pop();
          if (request.method() === 'PUT') {
            const body=request.postDataJSON(); puts.push({id,...body});
            if (fail) return reply({status:503,json:{detail:'synthetic failure'}});
            if (release && body.current_model==='openai:shared') await new Promise(resolve => {release.resolve=resolve;});
            if (body.expected_updated_at !== db.get(id).updated_at) {conflicts++;return reply({status:409,json:{detail:'session_version_conflict'}});}
            db.set(id,{...db.get(id),current_model:body.current_model,updated_at:new Date().toISOString()});
          }
          data={...db.get(id),model_selection_guard:true};
        } else if (path === '/llm-models') { data={models:catalog};catalogReads++; }
        else if (path === '/llm-models/chat-preferences') data={preferences:[]};
        else if (path.startsWith('/design/intake/by-chat/')) data={session_id:null,questions:[],round:1,brief:null};
        else if (path === '/chat/messages') data={messages:[],has_more:false,next_cursor:null};
        else if (path.includes('streaming-status')) data={generating:false,is_streaming:false,status:'idle',messages:[]};
        else if (path === '/chat/messages/send' && request.method() === 'POST') {
          sends.push(request.postDataJSON());
          return reply({status:200,contentType:'text/event-stream',body:'data: {"type":"done"}\n\n'});
        } else if (path.endsWith('/roles')) data={roles:[]};
        else if (path === '/goals') data=[];
        else if (path.includes('/goals')) data={goals:[],signals:[]};
        else if (/artifacts|todos|approvals|notifications/.test(path)) data=[];
        if(data === undefined) return reply({status:404,json:{detail:'outside synthetic model-selection test'}});
        await reply({json:data});
      });
      await page.goto(`${base}/chat#${first}`,{waitUntil:'domcontentloaded',timeout:120000});
      if (width<600) await page.getByTitle('모바일 설정',{exact:true}).click();
      const selector=page.getByRole('combobox',{name:'채팅 모델',exact:true});
      await selector.waitFor({timeout:90000});
      try {
        await page.waitForFunction(() => [...document.querySelectorAll('select[aria-label="채팅 모델"] option')].some(o=>o.value==='codex:shared'));
      } catch (error) {
        await page.screenshot({path:'/tmp/chat-model-fixture-failure.png'});
        console.log('FIXTURE_DIAGNOSTIC',await selector.innerHTML(),catalogReads,errors);
        throw error;
      }
      await page.waitForFunction(()=>document.querySelector('select[aria-label="채팅 모델"]')?.value==='openai:shared');
      for (const nextCatalog of [[],models.map(m=>({...m,is_active:false,is_selectable:false})),models]) {
        catalog=nextCatalog; const reads=catalogReads;
        await page.evaluate(() => {window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
        await page.waitForTimeout(900);
        assert.ok(catalogReads>reads);assert.equal(await selector.inputValue(),'openai:shared');assert.equal(puts.length,0);
      }
      fail=true;await selector.selectOption('codex:shared');
      await page.getByRole('button',{name:'다시 저장',exact:true}).waitFor();
      assert.equal(db.get(first).current_model,'openai:shared');
      fail=false;await page.getByRole('button',{name:'다시 저장',exact:true}).click();
      await page.waitForFunction(()=>!document.body.textContent.includes('모델 저장 중')&&!document.body.textContent.includes('모델 저장에 실패'));
      assert.equal(db.get(first).current_model,'codex:shared');
      // A is accepted by the server, but its HTTP response times out. B must save
      // next, and A's later DB execution must fail its old version fence.
      release={};await selector.selectOption('openai:shared');
      while (!release.resolve) await page.waitForTimeout(20);
      await selector.selectOption('codex:shared');
      await page.waitForFunction(()=>!document.body.textContent.includes('모델 저장 중')&&!document.body.textContent.includes('모델 저장에 실패'),{},{timeout:25000});
      assert.equal(db.get(first).current_model,'codex:shared');
      release.resolve();release=null;
      for(let i=0;i<50&&!conflicts;i++) await page.waitForTimeout(20);
      assert.equal(conflicts,1);assert.equal(db.get(first).current_model,'codex:shared');
      assert.equal(await selector.inputValue(),'codex:shared');
      release={};await selector.selectOption('openai:shared');
      while (!release.resolve) await page.waitForTimeout(20);
      if(width<600) await page.getByRole('button',{name:'☰',exact:true}).click();
      await page.getByText('다른 세션 검증',{exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('select[aria-label="채팅 모델"]')?.value==='codex:shared');
      release.resolve();release=null;
      await page.waitForTimeout(300);
      assert.equal(await selector.inputValue(),'codex:shared');
      if(width<600) await page.getByRole('button',{name:'☰',exact:true}).click();
      await page.getByText('선택 유지 검증',{exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('select[aria-label="채팅 모델"]')?.value==='openai:shared');
      await page.reload({waitUntil:'domcontentloaded'});
      if (width<600) await page.getByTitle('모바일 설정',{exact:true}).click();
      await selector.waitFor();await page.waitForFunction(()=>document.querySelector('select[aria-label="채팅 모델"]')?.value==='openai:shared');
      const input=page.locator('textarea').first();await input.fill('합성 모델 전달 검증');await input.press('Enter');
      for(let i=0;i<100&&!sends.length;i++) await page.waitForTimeout(50);
      assert.equal(sends.length,1);assert.equal(sends[0].model_override,'openai:shared');
      await page.screenshot({path:`/tmp/aads-chat-model-selection-${width}.png`,fullPage:true});
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify({width,route:'/chat',capture:`/tmp/aads-chat-model-selection-${width}.png`,catalogReads,puts:puts.length,conflicts,model_override:sends[0].model_override,realApiCalls:0}));
      await context.close();
    }
  } finally {await browser.close();}
});
