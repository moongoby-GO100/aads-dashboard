import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function script() {
  const modules = new Map();
  function bundle(file) {
    if (modules.has(file)) return modules.get(file).id;
    const item = {id: modules.size, code: ''}; modules.set(file, item);
    item.code = fs.readFileSync(file, 'utf8').replace(/require\(['"]([^'"]+)['"]\)/g, (_, name) => `R(${bundle(createRequire(file).resolve(name))})`);
    return item.id;
  }
  const react = bundle(require.resolve('react')), dom = bundle(require.resolve('react-dom/client'));
  const source = (fs.readFileSync('src/components/chat/CanonicalApprovalPanel.tsx', 'utf8') + '\n' + fs.readFileSync('src/components/chat/CanonicalApprovalCards.tsx', 'utf8').replace(/^export \{.*$/gm, '').replace(/^const referenceId.*$/gm, '')).replace(/^import .*;\n/gm, '').replace(/export default /g, '').replace(/export /g, '');
  const app = `const {useCallback,useEffect,useRef,useState}=React;
const canTransitionDocument=(status,action,hasRevision)=>hasRevision&&status==='review';
const CANONICAL_NAV_PROJECTS=['AADS'];
function DocBadge({children}){return <span>{children}</span>}const statusTone=x=>x;
window.calls=[];window.events=[];
const seed=()=>({document:{document_key:'ohvis-ui-ux-design-profile-contract',title:'아주 긴 한글 문서 제목 '.repeat(12),generation:11,latest_revision_id:'r11',approved_revision_id:null},revision:{id:'r11',version:'11.0.0',content:'검토할 격리 본문'},status:'review',approval_card:{type:'canonical_document_approval',schema_version:1,project:'AADS',document_key:'ohvis-ui-ux-design-profile-contract',can_approve:true,revision_id:'r11',revision:11,generation:11}});
window.current=seed();window.postError=0;window.getError=0;
const api={getCanonicalDocument:async(p,k)=>{window.calls.push({method:'GET',p,k});if(window.getError)throw Error('API error '+window.getError);return structuredClone(window.current)},decideCanonicalDocument:async(p,k,action,r,g)=>{window.calls.push({method:'POST',p,k,action,r,g});await new Promise(r=>setTimeout(r,30));if(window.postError)throw Error('API error '+window.postError);window.current.document.approved_revision_id=r;window.current.status='approved';window.current.approval_card.can_approve=false;window.events.push({action:'approved',actor:'isolated-human',revision:r})}};
${source}
ReactClient.createRoot(document.getElementById('root')).render(<CanonicalApprovalCards documents={[{project:'AADS',document_key:'ohvis-ui-ux-design-profile-contract',endpoint:'https://evil.invalid/approve'},{project:'OTHER',document_key:'ohvis-ui-ux-design-profile-contract'},{project:'AADS',document_key:'../unlisted'}]}/>);`;
  return `const process={env:{NODE_ENV:'production'}};const M={${[...modules.values()].map(m=>`${m.id}:function(module,exports,R){${m.code}\n}`).join(',')}};const C={};function R(id){if(C[id])return C[id].exports;const m=C[id]={exports:{}};M[id](m,m.exports,R);return m.exports;}const React=R(${react}),ReactClient=R(${dom});${ts.transpileModule(app,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText}`;
}
test('canonical chat cards: isolated human approval, stale, duplicate, denial and recovery at desktop/mobile', {timeout:60000}, async()=>{
  const {chromium}=require(process.env.AADS_PLAYWRIGHT_MODULE || 'playwright-core');
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.AADS_CHROMIUM_PATH?{executablePath:process.env.AADS_CHROMIUM_PATH}:{})});
  try {
    for(const width of [1440,390]) {
      const page=await browser.newPage({viewport:{width,height:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      async function mount(){await page.goto('about:blank');await page.setContent('<meta charset="utf-8"><style>body{margin:16px;font-family:sans-serif}article{overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}button,summary{min-height:44px}</style><div id="root"></div>');await page.addScriptTag({content:script()});await page.getByText('판본: 11 · v11.0.0',{exact:true}).waitFor();}
      const approve=()=>page.getByRole('button',{name:'정본 승인',exact:true});
      const refresh=()=>page.getByRole('button',{name:'새로고침',exact:true}).click();
      const open=()=>page.getByText('내용 보기 · 승인할 본문 확인',{exact:true}).click();
      await mount();assert.equal(await page.getByRole('article').count(),1);assert.equal(await approve().isDisabled(),true);
      await open();await approve().click();await page.getByText('승인되었습니다. 잠시 후 이 카드는 닫힙니다.').waitFor();
      assert.equal(await approve().isDisabled(),true);
      assert.equal(await page.evaluate(()=>calls.filter(x=>x.method==='POST').length),1);
      assert.deepEqual(await page.evaluate(()=>events),[{action:'approved',actor:'isolated-human',revision:'r11'}]);
      const capture=`/tmp/aads-canonical-approval-${width}.png`;await page.screenshot({path:capture,fullPage:true});
      await mount();await open();await page.evaluate(()=>{current.document.generation++;current.approval_card.generation++;current.approval_card.revision_id='r12';current.revision.id='r12';current.document.latest_revision_id='r12';current.revision.version='12.0.0'});
      await approve().click();
      await page.getByText('판본이 변경되었습니다. 최신 내용을 다시 열어 확인한 후 승인하세요.').waitFor();
      assert.equal(await approve().isDisabled(),true);assert.equal(await page.evaluate(()=>calls.filter(x=>x.method==='POST').length),0);
      await open();await approve().click();await page.getByText('승인되었습니다. 잠시 후 이 카드는 닫힙니다.').waitFor();
      for(const status of [401,403,404,409,500]) {
        await mount();await open();await page.evaluate(s=>{window.postError=s},status);await approve().click();
        await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent);
        assert.equal(await approve().isDisabled(),true);
        await page.evaluate(()=>{postError=0});await refresh();await page.getByText('판본: 11 · v11.0.0',{exact:true}).waitFor();await open();await approve().click();await page.getByText('승인되었습니다. 잠시 후 이 카드는 닫힙니다.').waitFor();
      }
      for(const mode of ['denied','removed','unknown']){
        await mount();await page.evaluate(mode=>{if(mode==='denied')current.approval_card.can_approve=false;if(mode==='removed')current.status='removed';if(mode==='unknown')delete current.approval_card.can_approve},mode);await refresh();
        if(mode==='removed'){await page.waitForFunction(()=>!document.querySelector('article'));continue;}
        await page.getByText('판본: 11 · v11.0.0',{exact:true}).waitFor();await open();assert.equal(await approve().isDisabled(),true);
      }
      assert.deepEqual(errors,[]);console.log(JSON.stringify({width,capture,productionRequests:0,evidence:'isolated component; mocked API/event, not deployed /chat or DB audit'}));await page.close();
    }
  }finally{await browser.close()}
});
