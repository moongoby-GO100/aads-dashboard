import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

function declarations(source, names) {
  const file = ts.createSourceFile('fixture.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = names.map(name => {
    const matches = [];
    function visit(node) {
      if (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === name)) matches.push(node);
      ts.forEachChild(node, visit);
    }
    visit(file);
    assert.equal(matches.length, 1, `Expected exactly one declaration: ${name}`);
    return matches[0].getText(file);
  });
  assert.ok(found.every(text => text.length > 0));
  return found.join('\n');
}


// Real React DOM and source callbacks; no production approval endpoints are used.
test('isolated source UI: selection, cancellation, failure recovery and session switch', {timeout:30000}, async () => {
  const require = createRequire(import.meta.url);
  const { chromium } = require('playwright-core');
  const modules = new Map();
  function bundle(file) {
    if (modules.has(file)) return modules.get(file).id;
    const id = modules.size;
    const entry = { id, code: '' }; modules.set(file, entry);
    entry.code = fs.readFileSync(file, 'utf8').replace(/require\(['"]([^'"]+)['"]\)/g, (_, name) => {
      const resolved = createRequire(file).resolve(name);
      return `R(${bundle(resolved)})`;
    });
    return id;
  }
  const react = bundle(require.resolve('react'));
  const dom = bundle(require.resolve('react-dom/client'));
  const runtime = bundle(require.resolve('react/jsx-runtime'));
  const source = fs.readFileSync('src/components/GoalApprovalControls.tsx','utf8');
  const chat = fs.readFileSync('src/app/chat/page.tsx','utf8');
  const callbacks = declarations(chat,['refreshApprovals','decideApproval','decideApprovalBulk']);
  const policy = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const app = `
const {useState,useRef,useCallback,useMemo,useLayoutEffect}=React;
function App(){
 const [project,setProject]=useState('GO100'); const [sid,setSid]=useState('a'); const activeSessionRef=useRef(sid);useLayoutEffect(()=>{activeSessionRef.current=sid;},[sid]);
 const approvalViewRef=useRef({sid,epoch:0}); useLayoutEffect(()=>{approvalViewRef.current={sid,epoch:approvalViewRef.current.epoch+1};},[sid]);
 const approvalViewToken=useMemo(()=>({sid}),[sid]);const committedApprovalToken=useRef(approvalViewToken);useLayoutEffect(()=>{committedApprovalToken.current=approvalViewToken;},[approvalViewToken]);const bulkApprovalInFlightRef=useRef(null);
 const approvalSessionRef=useRef('a');const approvalRequestRef=useRef(0);const approvalInFlightRef=useRef(new Set());
 const [approvals,setApprovals]=useState([{id:'card'}]);const [approvalBusy,setApprovalBusy]=useState(null);
 const approvalsRef=useRef(approvals);useLayoutEffect(()=>{approvalsRef.current=approvals;},[approvals]);
 const [approvalError,setApprovalError]=useState('');const [selectedApprovalIds,setSelectedApprovalIds]=useState(new Set(['card']));
 const [bulkApprovalBusy,setBulkApprovalBusy]=useState(false);const [tick,setApprovalDecisionTick]=useState(0);
 const [vaultCards,setVaultCards]=useState([]);const APPROVAL_GRANTS={single:{hours:2,max:1}};
 const chatApi=async(path)=>{window.chatCalls.push(path);if(window.chatFail) throw Error('403 fixture');return path.includes('pending')?{pending:[{id:'card'}]}:{};};
 ${callbacks}
 const h=Controls.useGoalApprovalPolicy(sid,project);
 return <><select aria-label="목표 프로젝트" value={project} onChange={e=>setProject(e.target.value)}>{["AADS","SF","NTV2","KIS","GO100"].map(p=><option key={p}>{p}</option>)}</select><Controls.GoalApprovalControls {...h} project={project} sessionProject="AADS"/>
 <output id="usage">{h.policy?.used}</output>
 <button onClick={()=>{approvalSessionRef.current='old';}}>stale</button>
 <button onClick={()=>void decideApproval('card','approved')}>decide</button>
 <button onClick={()=>void refreshApprovals(sid)}>reload approvals</button>
 <button onClick={()=>void decideApprovalBulk(['card'],'approved')}>bulk</button>
 <button onClick={()=>setSid(sid==='a'?'b':'a')}>switch</button>
 <output id="session">{sid}</output><output id="selected">{selectedApprovalIds.size}</output><output id="cards">{approvals.length}</output>
 {approvalError&&<p role="alert">{approvalError}</p>}</>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);`;
  const appJs=ts.transpileModule(app,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.None}}).outputText;
  const script=`const process={env:{NODE_ENV:'production'}};const M={${[...modules.values()].map(m=>`${m.id}:function(module,exports,R){${m.code}\n}`).join(',')}};const C={};function R(id){if(C[id])return C[id].exports;const module=C[id]={exports:{}};M[id](module,module.exports,R);return module.exports;}const React=R(${react}),ReactDOM=R(${dom});window.calls=[];window.chatCalls=[];window.chatFail=false;window.policyFail=false;const api={getGoalApprovalPolicy:async()=>({auto_approve_high:false,auto_approve_critical:false,max_executions:0,used:2,...window.profileFixture}),setGoalApprovalPolicy:async(id,body)=>{window.calls.push({id,body});if(window.policyFail)throw Error(String(window.policyFail)+' fixture');return {};}};const module={exports:{}};const exports=module.exports;const require=n=>n==='react'?React:n==='react/jsx-runtime'?R(${runtime}):{api};${policy}\nconst Controls=module.exports;${appJs}`;
  let browser;
  try {
    browser=await chromium.launch({...(process.env.AADS_CHROMIUM_PATH ? {executablePath:process.env.AADS_CHROMIUM_PATH} : {}),headless:true,timeout:10000,args:['--no-sandbox']});
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const route='about:blank#isolated-approval-source-fixture';
    await page.goto(route);
    await page.setContent('<meta charset="utf-8"><div id="root"></div>');
    await page.addScriptTag({content:script});
    const boxes=page.getByRole('checkbox');await boxes.nth(1).waitFor();await page.waitForFunction(()=>!document.querySelector('fieldset').disabled);
    // Render server metadata through the real shared source component, without POSTs.
    for (const [project, profile, high, critical] of [
      ['AADS','general','다음 단계 자동 진행(고위험 제외)','고위험 단계까지 자동 진행'],
      ['GO100','trading','실매매 코드 수정 미리 승인','주문·자금까지 미리 승인'],
    ]) {
      await page.evaluate(({profile,high,critical})=>{ window.profileFixture={profile,options:{
        auto_approve_high:{label:high,description:profile==='trading'?'실매매 코드 수정을 이 목표 달성까지 미리 승인합니다. 허용 횟수를 넘으면 다시 묻습니다.':'critical을 제외한 다음 단계 제안에 적용됩니다. 코드·도구 권한을 새로 주는 것이 아니라 다음 단계 제안 카드 승인을 생략하는 설정입니다.',risk_tone:'warning'},
        auto_approve_critical:{label:critical,description:profile==='trading'?'주문·자금·서비스 재기동까지 미리 승인 (돈이 직접 걸립니다). 허용 횟수를 넘으면 다시 묻습니다.':'critical 단계 제안에 적용됩니다. 그 외 단계는 위의 다음 단계 자동 진행 설정을 따릅니다.',risk_tone:'danger'},
      }}; },{profile,high,critical});
      await page.getByRole('combobox',{name:'목표 프로젝트'}).selectOption(project);
      await page.getByRole('checkbox',{name:new RegExp('^'+high.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).waitFor();
      await page.getByRole('checkbox',{name:new RegExp('^'+critical)}).waitFor();
      assert.equal(await page.getByText(/실제 금전 손실 위험/).count(),project==='GO100'?1:0);
      await page.screenshot({path:`/tmp/목표승인카드-approval-profiles-${project}.png`,fullPage:true});
    }
    assert.equal(await page.evaluate(()=>window.calls.length),0);
    await page.evaluate(()=>{window.profileFixture=undefined;});
    for (const project of ['AADS','SF','NTV2','KIS','GO100']) {
      await page.getByRole('combobox',{name:'목표 프로젝트'}).selectOption(project);
      await page.waitForFunction(()=>!document.querySelector('fieldset').disabled);
      page.once('dialog', d=>d.accept()); await boxes.nth(0).click();
      await page.waitForFunction(()=>document.querySelectorAll('input')[2].checked);
      await boxes.nth(0).click();
      await page.waitForFunction(()=>!document.querySelectorAll('input')[1].checked);
    }
    for (const status of [401,403,404,409,410]) {
      await page.evaluate(status=>window.policyFail=status,status);
      await boxes.nth(1).click(); await page.getByText(new RegExp(status+' fixture')).waitFor();
      assert.equal(await boxes.nth(1).isChecked(),false);
    }
    await page.evaluate(()=>{window.policyFail=false;window.calls=[];});
    await boxes.nth(1).click();await page.waitForFunction(()=>document.querySelector('#usage').textContent==='0');
    assert.equal(await page.evaluate(()=>window.calls[0].body.max_executions),200);
    assert.equal(await boxes.nth(0).evaluate(e=>e.indeterminate),true);
    page.once('dialog',d=>d.dismiss());await boxes.nth(0).click();assert.equal(await boxes.nth(2).isChecked(),false);
    page.once('dialog',d=>d.accept());await boxes.nth(0).click();await page.waitForFunction(()=>document.querySelectorAll('input')[2].checked);
    await boxes.nth(1).click();await boxes.nth(0).click();await boxes.nth(0).click();
    await page.evaluate(()=>window.policyFail=409);await boxes.nth(1).click();await page.getByText(/409 fixture/).waitFor();assert.equal(await boxes.nth(1).isChecked(),false);
    await page.evaluate(()=>window.policyFail=false);await boxes.nth(1).click();await page.waitForFunction(()=>document.querySelectorAll('input')[1].checked);
    await page.getByRole('button',{name:'stale',exact:true}).click();await page.getByRole('button',{name:'decide',exact:true}).click();await page.getByText(/대화 또는 승인 목록/).waitFor();assert.equal(await page.evaluate(()=>window.chatCalls.length),0);
    await page.getByRole('button',{name:'reload approvals',exact:true}).click();await page.evaluate(()=>window.chatFail=true);await page.getByRole('button',{name:'bulk',exact:true}).click();await page.getByText(/승인 처리 실패/).waitFor();assert.equal(await page.locator('#selected').textContent(),'1');
    await page.screenshot({path:'/tmp/aads-approval-failure.png',fullPage:true});
    await page.evaluate(()=>window.chatFail=false);await page.getByRole('button',{name:'bulk',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#selected').textContent==='0');
    await page.getByRole('button',{name:'switch',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#session').textContent==='b');
    await page.getByRole('button',{name:'decide',exact:true}).click();await page.getByText(/대화 또는 승인 목록/).waitFor();
    await page.screenshot({path:'/tmp/aads-approval-session-switch.png',fullPage:true});assert.deepEqual(errors,[]);
    console.log(JSON.stringify({route,login:'isolated fixture; no authentication or production approvals',captures:['/tmp/aads-approval-failure.png','/tmp/aads-approval-session-switch.png']}));
  } finally { await browser?.close(); }
});
