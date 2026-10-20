import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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


function fixture() {
  const slots = []; let cursor = 0; let effects = []; let confirm = true;
  const calls = []; const requests = []; const confirmations = [];
  const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise, resolve, reject}; };
  const react = {
    useState(init) { const i=cursor++; if (!(i in slots)) slots[i]=typeof init==='function'?init():init; return [slots[i], v => { slots[i]=typeof v==='function'?v(slots[i]):v; }]; },
    useRef(init) { const i=cursor++; return slots[i] ||= {current:init}; },
    useCallback(fn) { cursor++; return fn; },
    useEffect(fn,deps) { const i=cursor++; const old=slots[i]; if (!old || deps.some((v,j)=>v!==old.deps[j])) { old?.cleanup?.(); slots[i]={deps}; effects.push(()=>{ slots[i].cleanup=fn(); }); } },
  };
  react.useLayoutEffect = react.useEffect;
  const api = {
    getGoalApprovalPolicy(id) { const d=deferred(); requests.push({id,...d}); return d.promise; },
    setGoalApprovalPolicy(id,body) { const d=deferred(); calls.push({id,body,...d}); return d.promise; },
  };
  const mod={exports:{}};
  const jsx=(type,props)=>({type,props});
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/GoalApprovalControls.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText, {
    Error, exports:mod.exports, require:n=>n==='react'?react:n==='react/jsx-runtime'?{jsx,jsxs:jsx}:{api}, window:{confirm:text=>{ confirmations.push(text); return confirm; }},
  });
  return { calls, requests, confirmations, setConfirm:v=>confirm=v,
    render(id='a', project='GO100') { cursor=0; const result=mod.exports.useGoalApprovalPolicy(id, project); effects.splice(0).forEach(fn=>fn()); return result; },
    controls:mod.exports.GoalApprovalControls, summary:mod.exports.approvalSummary,
  };
}
const initial={auto_approve_high:true,auto_approve_critical:false,max_executions:200,used:2};
async function ready(f) { f.render(); f.requests[0].resolve(initial); await Promise.resolve(); return f.render(); }
function inputs(node) { if (!node || typeof node!=='object') return []; return [...(node.type==='input'?[node]:[]), ...[node.props?.children].flat().flatMap(inputs)]; }

test('partial → all → individual off → none, one save per action and indeterminate',async()=>{
 const f=fixture(); let h=await ready(f);
 const el={}; inputs(f.controls({...h,project:'GO100'}))[0].props.ref(el); assert.equal(el.indeterminate,true);
 for (const patch of [{auto_approve_high:true,auto_approve_critical:true},{auto_approve_high:false},{auto_approve_high:false,auto_approve_critical:false}]) {
   const saving=h.savePolicy(patch); f.calls.at(-1).resolve({used:2}); await saving; h=f.render();
 }
 assert.equal(f.calls.length,3); assert.equal(h.policy.auto_approve_high,false); assert.equal(h.policy.auto_approve_critical,false);
});
test('critical cancellation preserves both values without request',async()=>{
 const f=fixture(); const h=await ready(f); f.setConfirm(false);
 await h.savePolicy({auto_approve_high:false,auto_approve_critical:true});
 assert.equal(f.calls.length,0); assert.equal(f.render().policy.auto_approve_high,true);
});
test('duplicate click is blocked; failed save preserves policy and can retry',async()=>{
 const f=fixture(); let h=await ready(f); const pending=h.savePolicy({auto_approve_high:false});
 await h.savePolicy({auto_approve_high:false}); assert.equal(f.calls.length,1);
 f.calls[0].reject(new Error('403 forbidden')); await pending; h=f.render();
 assert.equal(h.policy.auto_approve_high,true); assert.match(h.policyError,/403/);
 const retry=h.savePolicy({auto_approve_high:false}); f.calls[1].resolve({used:2}); await retry;
 assert.equal(f.render().saving,false);
});
test('session/goal switch ignores old save and old load responses; reload reads server',async()=>{
 const f=fixture(); let h=await ready(f); const pending=h.savePolicy({auto_approve_high:false});
 f.render('b'); assert.equal(f.render('b').policy,null);
 f.calls[0].resolve({used:9}); await pending; assert.equal(f.render('b').policy,null);
 f.requests[1].resolve({...initial,auto_approve_high:false}); await Promise.resolve();
 h=f.render('b'); assert.equal(h.policy.auto_approve_high,false);
 h.retryPolicy(); f.render('b'); f.requests[2].resolve(initial); await Promise.resolve();
 assert.equal(f.render('b').policy.auto_approve_high,true);
});

function decisionFixture(status) {
 const src=fs.readFileSync('src/app/chat/page.tsx','utf8');
 let finish;
 const pending=new Promise((resolve,reject)=>{finish=()=>status?reject(new Error(`${status} fixture`)):resolve({});});
 const f={activeSessionRef:{current:'a'},approvalSessionRef:{current:'a'},approvalViewRef:{current:{sid:'a',epoch:0}},approvalRequestRef:{current:0},approvals:[{id:'card'}],approvalInFlightRef:{current:new Set()},alerts:[],calls:0,ticks:0,busy:null};
 const token={};
 const context={...f, approvalsRef:{get current(){return f.approvals;}}, committedApprovalToken:{current:token}, approvalViewToken:token, APPROVAL_GRANTS:{single:{hours:2,max:1}}, useCallback:fn=>fn,
   setApprovalError:t=>f.alerts.push(t),
   setApprovalBusy:v=>{f.busy=typeof v==='function'?v(f.busy):v;},
   chatApi:()=>{f.calls++;return pending;},
   setApprovals:fn=>{f.approvals=fn(f.approvals);},setApprovalDecisionTick:()=>f.ticks++,window:{alert:t=>f.alerts.push(t)},
 };
 vm.createContext(context);
 vm.runInContext(ts.transpileModule(declarations(src,['decideApproval'])+'\nglobalThis.decide=decideApproval;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {...f,state:f,decide:context.decide,finish};
}
for (const status of [401,403,404,409,410]) test(`HTTP ${status}: visible error, card retained, busy released, retry allowed`,async()=>{
 const f=decisionFixture(status);const p=f.decide('card','approved');
 assert.equal(await f.decide('card','approved'),false);assert.equal(f.state.calls,1);
 f.finish();assert.equal(await p,false);
 assert.match(f.state.alerts[0],new RegExp(String(status)));assert.equal(f.state.busy,null);assert.equal(f.state.approvals.length,1);
 await f.decide('card','approved');assert.equal(f.state.calls,2);
});
test('client session mismatch and unknown card do not send requests',async()=>{
 const f=decisionFixture(); f.activeSessionRef.current='other';
 assert.equal(await f.decide('card','approved'),false); f.activeSessionRef.current='a';
 assert.equal(await f.decide('unknown','approved'),false);assert.equal(f.state.calls,0);
});
test('session switch while decision pending does not mutate new view',async()=>{
 const f=decisionFixture();const p=f.decide('card','approved');f.activeSessionRef.current='b';f.approvalViewRef.current={sid:'b',epoch:1};f.finish();
 assert.equal(await p,false);assert.equal(f.state.ticks,0);assert.equal(f.state.approvals.length,1);
});

test('stale policy load cannot populate another goal', async()=>{
 const f=fixture(); f.render('a'); f.render('b');
 f.requests[0].resolve(initial); await Promise.resolve();
 assert.equal(f.render('b').policy,null);
 f.requests[1].resolve(initial); await Promise.resolve();
 assert.equal(f.render('b').policy.auto_approve_high,true);
});
test('confirmation follows goal project; financial risk remains explicit', async()=>{
 const f=fixture(); await ready(f); f.setConfirm(false);
 await f.render('a','AADS').savePolicy({auto_approve_critical:true});
 assert.equal(f.confirmations.length,0);
 f.render('a','GO100'); f.requests.at(-1).resolve(initial); await Promise.resolve();
 await f.render('a','GO100').savePolicy({auto_approve_critical:true});
 assert.match(f.confirmations.at(-1),/주문·자금/); assert.match(f.confirmations.at(-1),/실제.*손실/);
 const tree=f.controls({...f.render('a','GO100'),project:'GO100',sessionProject:'AADS'});
 assert.equal(tree.props.children[0].props.role,'alert');
});

 test('stale list guard shows recovery instead of silently returning',async()=>{
 const f=decisionFixture();f.approvalSessionRef.current='old';
 assert.equal(await f.decide('card','approved'),false);assert.equal(f.state.calls,0);
 assert.match(f.state.alerts[0],/다시 조회/);
 });
 test('ABA decision response cannot mutate returned session',async()=>{
 const f=decisionFixture();const p=f.decide('card','approved');
 f.approvalViewRef.current={sid:'b',epoch:1};f.approvalViewRef.current={sid:'a',epoch:2};f.finish();
 assert.equal(await p,false);assert.equal(f.state.ticks,0);
 });
 test('unloaded or unresolved projects cannot save policies',async()=>{
 for (const project of ['AADS','']) {const f=fixture();const h=f.render('a',project);await h.savePolicy({auto_approve_high:true});assert.equal(f.requests.length,project ? 1 : 0);assert.equal(f.calls.length,0);}
 });
function pendingFixture() {
 const src=fs.readFileSync('src/app/chat/page.tsx','utf8');
 const f={approvalViewRef:{current:{sid:'a',epoch:0}},approvalRequestRef:{current:0},approvalSessionRef:{current:'a'},cards:[{id:'old'}],selected:new Set(['old']),errors:[],requests:[]};
 const context={...f,useCallback:fn=>fn,setApprovals:v=>f.cards=v,setSelectedApprovalIds:v=>f.selected=v,setApprovalError:v=>f.errors.push(v),setVaultCards:()=>{},chatApi:()=>new Promise((resolve,reject)=>f.requests.push({resolve,reject}))};
 vm.createContext(context);vm.runInContext(ts.transpileModule(declarations(src,['refreshApprovals'])+'\nglobalThis.refresh=refreshApprovals;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
 return {...f,state:f,refresh:context.refresh};
}
test('pending failure invalidates stale cards/selection and reload recovers',async()=>{
 const f=pendingFixture();const p=f.refresh('a');f.requests[0].reject(new Error('401 fixture'));await p;
 assert.equal(f.state.cards.length,0);assert.equal(f.state.selected.size,0);assert.equal(f.approvalSessionRef.current,null);assert.match(f.errors.at(-1),/401.*다시 조회/);
 const retry=f.refresh('a');f.requests[1].resolve({pending:[{id:'new'}]});await retry;assert.equal(f.state.cards[0].id,'new');assert.equal(f.approvalSessionRef.current,'a');assert.equal(f.errors.at(-1),'');
});
test('old pending requests cannot overwrite newer requests or ABA session',async()=>{
 const f=pendingFixture();const old=f.refresh('a');const latest=f.refresh('a');f.requests[1].resolve({pending:[{id:'latest'}]});await latest;f.requests[0].resolve({pending:[{id:'old'}]});await old;assert.equal(f.state.cards[0].id,'latest');
 const aba=f.refresh('a');f.approvalViewRef.current={sid:'b',epoch:1};f.approvalViewRef.current={sid:'a',epoch:2};f.requests[2].resolve({pending:[{id:'stale-aba'}]});await aba;assert.equal(f.state.cards[0].id,'latest');
});
for(const status of [401,403,404,409,410]) test(`policy HTTP ${status} preserves policy and permits retry`,async()=>{
 const f=fixture();let h=await ready(f);const p=h.savePolicy({auto_approve_high:false});f.calls[0].reject(new Error(`${status} fixture`));await p;h=f.render();assert.equal(h.policy.auto_approve_high,true);assert.match(h.policyError,new RegExp(String(status)));const retry=h.savePolicy({auto_approve_high:false});f.calls[1].resolve({used:2});await retry;assert.equal(f.render().policy.auto_approve_high,false);
});
test('bulk removes only successes; failed and unprocessed items remain selected',async()=>{
 const src=fs.readFileSync('src/app/chat/page.tsx','utf8');
 const f={selected:new Set(['ok','failed','later']),calls:[],busy:false};const ctx={bulkApprovalInFlightRef:{current:null},useCallback:fn=>fn,activeSessionRef:{current:'a'},approvalViewRef:{current:{sid:'a',epoch:0}},decideApproval:async id=>{f.calls.push(id);return id==='ok';},setBulkApprovalBusy:v=>f.busy=v,setSelectedApprovalIds:fn=>f.selected=fn(f.selected)};
 vm.createContext(ctx);vm.runInContext(ts.transpileModule(declarations(src,['decideApprovalBulk'])+'\nglobalThis.bulk=decideApprovalBulk;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,ctx);
 await Promise.all([ctx.bulk(['ok','failed','later'],'approved'),ctx.bulk(['ok','failed','later'],'approved')]);assert.deepEqual(f.calls,['ok','failed']);assert.deepEqual([...f.selected],['failed','later']);assert.equal(f.busy,false);
});
test('old policy handler cannot save after goal ABA',async()=>{
 const f=fixture();const old=await ready(f);f.render('b');f.render('a');await old.savePolicy({auto_approve_high:false});assert.equal(f.calls.length,0);
});

for (const patch of [{auto_approve_high:true}, {auto_approve_high:true,auto_approve_critical:true}]) test(`unconfigured policy first selection sends default limit: ${JSON.stringify(patch)}`,async()=>{
 const f=fixture();f.render();f.requests[0].resolve({...initial,auto_approve_high:false,max_executions:0,used:0});await Promise.resolve();
 const h=f.render();assert.equal(h.policy.max_executions,0);
 const pending=h.savePolicy(patch);assert.equal(f.calls[0].body.max_executions,200);
 f.calls[0].resolve({});await pending;assert.equal(f.render().policy.max_executions,200);
});
test('save without used mirrors server reset when either approval stays enabled',async()=>{
 for(const patch of [{auto_approve_critical:true},{max_executions:321}]) {
 const f=fixture();const h=await ready(f);const pending=h.savePolicy(patch);
 f.calls[0].resolve({});await pending;assert.equal(f.render().policy.used,0);
 }
});
test('disable both without used retains usage; explicit server usage takes precedence',async()=>{
 const f=fixture();let h=await ready(f);let pending=h.savePolicy({auto_approve_high:false,auto_approve_critical:false});
 f.calls[0].resolve({});await pending;assert.equal(f.render().policy.used,2);
 h=f.render();pending=h.savePolicy({auto_approve_high:true,max_executions:77});
 assert.equal(f.calls[1].body.max_executions,77);f.calls[1].resolve({used:4});await pending;assert.equal(f.render().policy.used,4);
});

for (const project of ['AADS','SF','NTV2','KIS','GO100']) test(`${project}: existing policy read, enable and disable`,async()=>{
 const f=fixture();f.render('a',project);f.requests[0].resolve(initial);await Promise.resolve();
 let h=f.render('a',project);assert.equal(h.supported,true);assert.equal(h.policy.used,2);
 let p=h.savePolicy({auto_approve_critical:true});assert.equal(f.calls.length,1);
 const trading=['KIS','GO100'].includes(project);
 assert.match(f.confirmations[0],trading?/다음 단계 제안/:/^고위험 단계 제안까지 이 목표 동안 묻지 않고 통과시킵니다\. 계속할까요\?$/);
 assert.equal(f.confirmations[0].includes('금전 손실'),trading);
 assert.equal(f.confirmations[0].includes('주문·자금'),trading);
 f.calls[0].resolve({});await p;h=f.render('a',project);
 p=h.savePolicy({auto_approve_high:false,auto_approve_critical:false});
 f.calls[1].resolve({});await p;h=f.render('a',project);
 assert.equal(h.policy.auto_approve_high,false);assert.equal(h.policy.auto_approve_critical,false);
});
test('decision reads latest committed list after polling without replacing callback',async()=>{
 const f=decisionFixture();f.state.approvals=[{id:'fresh'}];
 assert.equal(await f.decide('card','approved'),false);
 const p=f.decide('fresh','approved');f.finish();assert.equal(await p,true);
});
test('AST extraction fails closed for missing callbacks and ignores formatting',()=>{
 assert.throws(()=>declarations('const other = 1;', ['decideApproval']));
 assert.match(declarations('/* changed indent */ const decideApproval=()=>true;', ['decideApproval']),/decideApproval/);
});

function visibleText(node) {
 if (typeof node === 'string') return node;
 if (!node || typeof node !== 'object') return '';
 return [node.props?.children].flat().map(visibleText).join(' ');
}
const profileOptions = profile => ({
 auto_approve_high: {label: profile === 'trading' ? '실매매 코드 수정 미리 승인' : '다음 단계 자동 진행(고위험 제외)', description: `${profile} high 서버 설명`, risk_tone: 'warning'},
 auto_approve_critical: {label: profile === 'trading' ? '주문·자금까지 미리 승인' : '고위험 단계까지 자동 진행', description: `${profile} critical 서버 설명`, risk_tone: 'danger'},
});
for (const [project, profile] of [['GO100','trading'],['KIS','trading'],['AADS','general'],['NTV2','general'],['ACCT','general']]) {
 test(`${project}: server profile labels and descriptions survive saves without entering POST body`, async () => {
  const f=fixture(); const options=profileOptions(profile);
  f.render('a',project); f.requests[0].resolve({...initial,profile,options}); await Promise.resolve();
  let h=f.render('a',project);
  for (const patch of [{auto_approve_high:false},{max_executions:300}]) {
   const text=visibleText(f.controls({...h,project}));
   for (const option of Object.values(options)) { assert.ok(text.includes(option.label)); assert.ok(text.includes(option.description)); }
   assert.equal(text.includes('실제 금전 손실 위험'), profile==='trading');
   const pending=h.savePolicy(patch);
   assert.deepEqual(Object.keys(f.calls.at(-1).body).sort(),['auto_approve_critical','auto_approve_high','max_executions']);
   f.calls.at(-1).resolve({}); await pending; h=f.render('a',project);
   assert.equal(h.policy.profile,profile); assert.deepEqual(h.policy.options,options);
  }
 });
}
test('old server without options falls back to neutral wording; financial warning only for trading projects', async () => {
 const f=fixture(); const h=await ready(f); const text=visibleText(f.controls({...h,project:'GO100'}));
 assert.ok(text.includes('다음 단계 자동 진행'));
 assert.ok(text.includes('고위험 단계까지 자동 진행'));
 assert.equal(text.includes('주문·자금까지 미리 승인'),false);
 assert.ok(text.includes('실제 금전 손실 위험'));
 const g=fixture(); g.render('a','AADS'); g.requests[0].resolve(initial); await Promise.resolve();
 const general=visibleText(g.controls({...g.render('a','AADS'),project:'AADS'}));
 assert.equal(general.includes('금전 손실'),false);
});
test('GoalPanel renders no order/fund/live-trading wording for general goals; trading shows server labels', async () => {
 const panel=fs.readFileSync('src/components/GoalPanel.tsx','utf8');
 assert.doesNotMatch(panel,/주문·자금|실매매 코드|미리 승인/);
 for (const [project, profile] of [['AADS','general'],['ACCT','general'],['GO100','trading']]) {
  const f=fixture(); const options=profileOptions(profile);
  f.render('a',project); f.requests[0].resolve({...initial,auto_approve_critical:true,profile,options}); await Promise.resolve();
  const h=f.render('a',project);
  const text=visibleText(f.controls({...h,project}))+' '+f.summary(h.policy,true);
  assert.equal(/주문·자금|실매매/.test(text),profile==='trading',`${project}: ${text}`);
  if (profile==='trading') assert.ok(f.summary(h.policy,true).includes('주문·자금까지 미리 승인'));
  else assert.equal(f.summary(h.policy,true),'고위험 단계까지 자동 진행');
 }
 assert.equal(fixture().summary({auto_approve_high:true,auto_approve_critical:false},true),'다음 단계 자동 진행');
});
test('both goal screens retain the shared profile controls', () => {
 for (const path of ['src/components/GoalPanel.tsx','src/app/goals/page.tsx']) {
  assert.match(fs.readFileSync(path,'utf8'), /<GoalApprovalControls \{\.\.\.approvalControls\}/);
 }
});
