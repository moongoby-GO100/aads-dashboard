import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = fs.readFileSync('src/app/chat/page.tsx', 'utf8');
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function select(predicate) {
  const matches = [];
  function visit(node) { if (predicate(node)) matches.push(node); ts.forEachChild(node, visit); }
  visit(ast);
  assert.equal(matches.length, 1, 'Production source fragment must be unique');
  return matches[0].getText(ast);
}
function declaration(name) {
  return select(node => (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === name))
    || (ts.isFunctionDeclaration(node) && node.name?.text === name));
}
function browserScript() {
  const modules = new Map();
  function bundle(file) {
    if (modules.has(file)) return modules.get(file).id;
    const entry = { id: modules.size, code: '' }; modules.set(file, entry);
    entry.code = fs.readFileSync(file, 'utf8').replace(/require\(['"]([^'"]+)['"]\)/g, (_, name) => `R(${bundle(createRequire(file).resolve(name))})`);
    return entry.id;
  }
  const react = bundle(require.resolve('react'));
  const dom = bundle(require.resolve('react-dom/client'));
  const portal = bundle(require.resolve('react-dom'));
  const critical = select(node => ts.isConditionalExpression(node) && node.condition.getText(ast) === 'a.risk === "critical"');
  const dialog = select(node => ts.isJsxExpression(node) && node.expression?.getText(ast).startsWith('popupApprovals.length > 0 &&'));
  const badge = select(node => ts.isJsxExpression(node) && node.expression?.getText(ast).startsWith('approvals.length > 0 && popupApprovals.length === 0 &&'));
  const code = `
const {useState,useRef,useMemo,useCallback,useLayoutEffect}=React;
const {createPortal}=ReactDOM;
${declaration('APPROVAL_GRANTS')}
${declaration('approvalScopesFor')}
function App(){
 const [approvals,setApprovals]=useState([]), [hasMessage,setHasMessage]=useState(false);
 const [dismissedApprovalIds,setDismissedApprovalIds]=useState([]);
 const fixture={id:'fixture-approval',source_message_id:'fixture-answer',tool:'run_remote_command',summary:'합성 승인 요청 — 실제 명령 실행 없음',at:'fixture',risk:'critical'};
 const approvalsRef=useRef(approvals);useLayoutEffect(()=>{approvalsRef.current=approvals;},[approvals]);
 const activeSessionRef=useRef('fixture-session'),approvalSessionRef=useRef('fixture-session');
 const inlineApprovalIds=useMemo(()=>new Set(hasMessage?approvals.map(a=>a.id):[]),[approvals,hasMessage]);
 const approvalJumpCursorRef=useRef(0);
 const chatViewportController={jumpToLatest(){}}, scrollMessageElementIntoView=()=>{},messagesEndRef={current:null};
 ${['popupStickyRef','popupApprovals','bottomApprovals','closeApprovalPopup','openApprovalPopup','jumpToPendingApproval'].map(declaration).join('\n')}
 const selectedApprovalIds=new Set(),bulkApprovalBusy=false,approvalBusy=null,approvalBusyId=null;
 const screenSize=innerWidth<600?'mobile':'desktop';
 const decideApproval=(id,decision,scope)=>{window.decisions.push({id,decision,scope});};
 const decideApprovalBulk=()=>{throw Error('Critical approval must never use bulk');};
 const toggleApprovalSelected=()=>{};
 const onOpenApproval=openApprovalPopup;
 window.fixture={message:()=>setHasMessage(true),approval:()=>setApprovals([fixture]),reset:()=>{setApprovals([]);setHasMessage(false);setDismissedApprovalIds([]);popupStickyRef.current.clear();},stale:()=>{approvalSessionRef.current='other-session';}};
 return <main style={{padding:24}}><h1>승인창 복구 격리 검증</h1>
 {hasMessage&&approvals.map(a=><section key={a.id} data-message-id="fixture-answer" data-approval-id={a.id}>{${critical}}</section>)}
 ${dialog}
 ${badge}
 </main>;
}
ReactClient.createRoot(document.getElementById('root')).render(<App/>);`;
  const app = ts.transpileModule(code, {compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
  return `const process={env:{NODE_ENV:'production'}};const M={${[...modules.values()].map(m=>`${m.id}:function(module,exports,R){${m.code}\n}`).join(',')}};const C={};function R(id){if(C[id])return C[id].exports;const m=C[id]={exports:{}};M[id](m,m.exports,R);return m.exports;}const React=R(${react}),ReactClient=R(${dom}),ReactDOM=R(${portal});window.decisions=[];${app}`;
}

test('production approval UI: both arrival orders, dismiss, inline/badge reopen, desktop/mobile', { timeout: 60000 }, async () => {
  const { chromium } = require(process.env.AADS_PLAYWRIGHT_MODULE || 'playwright-core');
  const browser = await chromium.launch({ headless:true, args:['--no-sandbox'], ...(process.env.AADS_CHROMIUM_PATH?{executablePath:process.env.AADS_CHROMIUM_PATH}:{}) });
  try {
    const script = browserScript();
    for (const width of [1440, 390]) {
      for (const order of ['message-first', 'approval-first']) {
        const page = await browser.newPage({ viewport:{width,height:900} });
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto('about:blank#chat-approval-recovery-source');
        await page.setContent('<meta charset="utf-8"><style>:root{--ct-text:#111827;--ct-text2:#374151;--ct-border:#d1d5db;--ct-bg:#fff;--ct-card:#fff}body{margin:0;font-family:sans-serif}</style><div id="root"></div>');
        await page.addScriptTag({content:script});
        await page.waitForFunction(()=>!!window.fixture);
        await page.evaluate(order=>window.fixture[order==='message-first'?'message':'approval'](),order);
        await page.evaluate(order=>window.fixture[order==='message-first'?'approval':'message'](),order);
        const dialog=page.getByRole('dialog');await dialog.waitFor();
        assert.equal(await dialog.getByRole('button',{name:'이번 건만',exact:true}).count(),1);
        assert.equal(await dialog.getByRole('checkbox').count(),0);
        assert.equal(await dialog.getByRole('button',{name:'이 프로젝트 동안',exact:true}).count(),0);
        await dialog.getByRole('button',{name:/나중에/}).click();await dialog.waitFor({state:'hidden'});
        await page.getByRole('button',{name:'승인 창 열기',exact:true}).click();await dialog.waitFor();
        await dialog.getByRole('button',{name:/나중에/}).click();
        await page.getByRole('button',{name:/승인 대기 1건 · 승인 확인/}).click();await dialog.waitFor();
        const box=await dialog.getByRole('button',{name:'이번 건만',exact:true}).boundingBox();
        assert.ok(box.width>0&&box.height>=44&&box.x>=0&&box.x+box.width<=width,'Approval button is visible inside viewport');
        await dialog.getByRole('button',{name:'이번 건만',exact:true}).click();
        assert.deepEqual(await page.evaluate(()=>window.decisions),[{id:'fixture-approval',decision:'approved',scope:'single'}]);
        const capture=`/tmp/aads-chat-approval-${width}-${order}.png`;
        await page.screenshot({path:capture,fullPage:true});
        console.log(JSON.stringify({route:'about:blank#chat-approval-recovery-source',width,order,capture,productionRequests:0}));
        assert.deepEqual(errors,[]);await page.close();
      }
    }
  } finally {await browser.close();}
});
