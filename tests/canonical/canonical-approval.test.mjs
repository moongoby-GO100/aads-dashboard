import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const code = transpile('src/components/chat/CanonicalApprovalPanel.tsx') + '\nexports.CanonicalApprovalCard = exports.CanonicalApprovalPanel;';
const workflow = {};
vm.runInNewContext(transpile('src/lib/canonicalDocumentWorkflow.ts'), {exports: workflow});
const exports = {};
vm.runInNewContext(code, {exports, Set, Map, require(name) {
  if(name==='@/lib/canonicalProjects')return {CANONICAL_NAV_PROJECTS:['AADS','DESIGN']};
  if(name==='@/lib/canonicalDocumentWorkflow')return workflow;
  return {};
}});
const {approvable, allowedCanonicalReference, reviewable, selectCanonicalCardRefs, shownCanonicalCardIds} = exports;
const detail = () => ({approval_card:{type:'canonical_document_approval',schema_version:1,project:'AADS',document_key:'ohvis-ui-ux-design-profile-contract',can_approve:true,revision_id:'latest',generation:12},status:'review',document:{document_key:'ohvis-ui-ux-design-profile-contract',generation:12,latest_revision_id:'latest',approved_revision_id:null},revision:{id:'latest'}});
test('approval requires explicit server capability and current, unapproved, available revision',()=>{
  assert.equal(approvable(detail()),true);
  for(const patch of [{approval_card:null},{approval_card:{...detail().approval_card,schema_version:2}},{approval_card:{...detail().approval_card,generation:11}},{approval_card:{...detail().approval_card,document_key:'unknown'}},{approval_card:{...detail().approval_card,can_approve:false}},{approval_card:{...detail().approval_card,can_approve:undefined}},{approval_card:{...detail().approval_card,can_approve:'true'}},{revision:null},{status:'removed'},{status:'archived'},{status:'missing'},{status:'draft'},{status:'approved'}])assert.equal(approvable({...detail(),...patch}),false);
  for(const patch of [{latest_revision_id:'newer'},{approved_revision_id:'latest'},{generation:0},{generation:-1},{generation:1.2},{generation:NaN}]){const d=detail();Object.assign(d.document,patch);assert.equal(approvable(d),false);}
});
test('allowlisted reference ignores arbitrary endpoints and rejects project/key injection',()=>{
  const key='ohvis-ui-ux-design-profile-contract';
  assert.equal(allowedCanonicalReference({project:'AADS',document_key:key,endpoint:'https://evil.invalid/approve'}),true);
  for(const project of ['../AADS','https://evil.invalid','AADS/documents','aads','OTHER'])assert.equal(allowedCanonicalReference({project,document_key:key}),false);
  for(const document_key of ['../approve','.hidden','-lead','',' space','a b','a/b','ohvis-ui-ux-design-profile-contract/approve','a'.repeat(129),undefined,7])assert.equal(allowedCanonicalReference({project:'AADS',document_key}),false);
});
test('any server-valid document key of a known project is allowed (no hard-coded document list)',()=>{
  for(const document_key of ['unknown','goal-panel-prd','A1','v1.2:draft_x','a'.repeat(128),'ohvis-ui-ux-asset-audit-requirements'])assert.equal(allowedCanonicalReference({project:'AADS',document_key}),true);
  assert.equal(allowedCanonicalReference({project:'DESIGN',document_key:'x'}),true);
});
test('card visibility: only a review document whose latest revision is unapproved',()=>{
  assert.equal(reviewable(detail()),true);
  for(const status of ['draft','approved','archived','removed','missing'])assert.equal(reviewable({...detail(),status}),false);
  assert.equal(reviewable({...detail(),revision:null}),false);
  const approved=detail();approved.document.approved_revision_id='latest';assert.equal(reviewable(approved),false);
  const stale=detail();stale.document.latest_revision_id='newer';assert.equal(reviewable(stale),false);
});
test('candidate selection de-duplicates and caps; shown cards capped at three',()=>{
  const refs=[{project:'AADS',document_key:'a'},{project:'AADS',document_key:'a'},{project:'OTHER',document_key:'b'},{project:'AADS',document_key:'../x'},{project:'DESIGN',document_key:'a'}];
  assert.equal(JSON.stringify(selectCanonicalCardRefs(refs)),JSON.stringify([{project:'AADS',document_key:'a'},{project:'DESIGN',document_key:'a'}]));
  const many=Array.from({length:30},(_, i)=>({project:'AADS',document_key:`d${i}`}));
  assert.equal(selectCanonicalCardRefs(many).length,12);
  const order=['p/1','p/2','p/3','p/4','p/5'];
  assert.equal(JSON.stringify(shownCanonicalCardIds(order,new Set(['p/2','p/3','p/4','p/5']))),JSON.stringify(['p/2','p/3','p/4']));
  assert.equal(shownCanonicalCardIds(order,new Set()).length,0);
  assert.equal(shownCanonicalCardIds(order,new Set(['p/9'])).length,0);
});

// Execute production handlers with a minimal hook host; no HTTP or production data.
function harness({status='review',documentKey='ohvis-ui-ux-design-profile-contract',getError=0,viewer=false}={}) {
  const states=[], pending=[], timers=[];
  let cursor=0, tree, scheduled=false;
  const current=detail();current.revision.version='12.0.0';current.revision.content='격리 본문';
  current.status=status;current.document.document_key=documentKey;current.approval_card.document_key=documentKey;
  if(status==='approved'){current.document.approved_revision_id='latest';current.approval_card.can_approve=false}
  const calls=[], events=[], visibility=[], approvals=[];
  let postError=0, getErr=getError;
  const api={
    async getCanonicalDocument(){calls.push('GET');if(getErr)throw Error(typeof getErr==='string'?getErr:`API error ${getErr}`);return structuredClone(current)},
    async decideCanonicalDocument(project,key,action,revision,generation){
      calls.push({project,key,action,revision,generation});
      await Promise.resolve();if(postError && postError!=='lost')throw Error(typeof postError==='string'?postError:`API error ${postError}`);
      current.document.approved_revision_id=revision;current.approval_card.can_approve=false;current.status='approved';events.push({action:'approved',actor:'isolated-human',revision});
      if(postError==='lost')throw Error('network response lost');
    },
  };
  const jsx=(type,props)=>({type,props});
  const hooks={
    useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>{states[i]=v;if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;render()})}}]},
    useRef(initial){const i=cursor++;return states[i]??(states[i]={current:initial})},
    useCallback(fn){return fn},
    useEffect(effect,deps){const i=cursor++;const prev=states[i];
      if(!prev||!deps||deps.length!==prev.deps.length||deps.some((d,k)=>d!==prev.deps[k]))pending.push({i,effect,deps});},
  };
  const timeouts={setTimeout:(fn,ms)=>{const t={fn,ms,live:true};timers.push(t);return t},clearTimeout:t=>{if(t)t.live=false}};
  const out={};vm.runInNewContext(code,{exports:out,Set,Map,Number,Error,...timeouts,require(name){
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='@/lib/api')return {api};
    if(name==='@/lib/canonicalProjects')return {CANONICAL_NAV_PROJECTS:['AADS']};
    if(name==='@/lib/canonicalDocumentWorkflow')return workflow;
    return {default:()=>null,statusTone:x=>x};
  }});
  const onVisibleChange=(id,visible)=>visibility.push([id,visible]);
  const props={project:'AADS',document_key:documentKey,onVisibleChange,viewer,onApproved:()=>approvals.push(current.document.approved_revision_id)};
  function render(){cursor=0;tree=out.CanonicalApprovalCard(props);
    while(pending.length){const {i,effect,deps}=pending.shift();states[i]?.cleanup?.();const cleanup=effect();states[i]={deps:deps??[],cleanup}}}
  function nodes(node,predicate){if(!node||typeof node!=='object')return [];const found=predicate(node)?[node]:[];return found.concat([node.props?.children].flat(Infinity).flatMap(child=>nodes(child,predicate)))}
  render();
  return {current,calls,events,visibility,approvals,setPostError:v=>postError=v,setGetError:v=>getErr=v,
    async settle(){for(let i=0;i<12;i++)await Promise.resolve()},
    rendered:()=>tree!==null&&tree!==undefined,
    text:()=>nodes(tree,()=>true).flatMap(n=>[n.props?.children].flat(Infinity)).filter(c=>typeof c==='string').join(' '),
    pendingTimers:()=>timers.filter(t=>t.live).length,
    runTimers(){for(const t of timers.filter(t=>t.live)){t.live=false;t.fn()}},
    button(name){return nodes(tree,n=>n.type==='button'&&n.props.children===name)[0]},
    open(){nodes(tree,n=>n.type==='details')[0].props.onToggle({currentTarget:{open:true}})},
  };
}
test('production handlers verify current state, block double click, then show approval and close',async()=>{
  const h=harness();await h.settle();h.open();await h.settle();
  const approve=h.button('정본 승인');approve.props.onClick();approve.props.onClick();await h.settle();
  assert.equal(h.calls.filter(x=>typeof x==='object').length,1);
  assert.deepEqual(h.events,[{action:'approved',actor:'isolated-human',revision:'latest'}]);
  assert.equal(h.calls.at(-1),'GET');assert.equal(h.button('정본 승인').props.disabled,true);
  assert.match(h.text(),/승인되었습니다/);assert.equal(h.pendingTimers(),1);
  h.runTimers();await h.settle();
  assert.equal(h.rendered(),false);assert.deepEqual(h.visibility.at(-1),['AADS/'+'ohvis-ui-ux-design-profile-contract',false]);
});
test('stale revision requires reopening current content before posting',async()=>{
  const h=harness();await h.settle();h.open();await h.settle();h.current.document.generation++;h.current.approval_card.generation++;
  h.button('정본 승인').props.onClick();await h.settle();
  assert.equal(h.calls.filter(x=>typeof x==='object').length,0);assert.equal(h.button('정본 승인').props.disabled,true);
  h.open();await h.settle();h.button('정본 승인').props.onClick();await h.settle();assert.equal(h.events.length,1);
});
test('401/403/404/409/network failure invalidates confirmation and recovers by refresh',async()=>{
  for(const status of [401,403,404,409,500]) {
    const h=harness();await h.settle();h.open();await h.settle();h.setPostError(status);
    h.button('정본 승인').props.onClick();await h.settle();assert.equal(h.events.length,0);assert.equal(h.button('정본 승인').props.disabled,true);
    h.setPostError(0);h.button('새로고침').props.onClick();await h.settle();assert.equal(h.button('정본 승인').props.disabled,true);
    h.open();await h.settle();h.button('정본 승인').props.onClick();await h.settle();assert.equal(h.events.length,1);
  }
});
test('document keys outside the old hard-coded list render a review card',async()=>{
  const h=harness({documentKey:'goal-panel-prd'});await h.settle();
  assert.equal(h.rendered(),true);assert.match(h.text(),/goal-panel-prd|정본/);
  assert.deepEqual(h.visibility.at(-1),['AADS/goal-panel-prd',true]);
});
test('no card (and no empty box) while loading or for draft/approved/archived/removed/missing documents',async()=>{
  const loading=harness();assert.equal(loading.rendered(),false);
  assert.deepEqual(loading.visibility.at(-1),['AADS/ohvis-ui-ux-design-profile-contract',false]);
  for(const status of ['draft','approved','archived','removed','missing']){
    const h=harness({status});await h.settle();
    assert.equal(h.rendered(),false,status);assert.equal(h.visibility.at(-1)[1],false,status);
  }
});
test('read failures (401/403/404/network) never render a card',async()=>{
  for(const getError of [401,403,404,500,'network down']){
    const h=harness({getError});await h.settle();
    assert.equal(h.rendered(),false,String(getError));
  }
});
test('409 revision_not_in_review / generation_conflict keep a Korean notice and the refresh button',async()=>{
  for(const [code,pattern] of [['revision_not_in_review',/검토 상태의 문서만 승인/],['generation_conflict',/다른 변경이 먼저 반영/]]){
    const h=harness();await h.settle();h.open();await h.settle();
    h.setPostError(`API error 409: {"detail":"${code}"}`);
    h.button('정본 승인').props.onClick();await h.settle();
    assert.equal(h.events.length,0);assert.equal(h.rendered(),true);
    assert.match(h.text(),pattern);assert.ok(h.button('새로고침'));assert.equal(h.pendingTimers(),0);
    // The server moved the document out of review: refresh clears the notice and the card goes away.
    h.setPostError(0);h.current.status='draft';h.button('새로고침').props.onClick();await h.settle();
    assert.equal(h.rendered(),false);
  }
});
test('refresh failure on a visible card keeps the card with a notice',async()=>{
  const h=harness();await h.settle();h.setGetError(500);
  h.button('새로고침').props.onClick();await h.settle();
  assert.equal(h.rendered(),true);assert.ok(h.button('새로고침'));
});
test('persisted and live canonical lookup results restore safe references without trusting capability/URLs',()=>{
  const card={type:'canonical_document_approval',schema_version:1,project:'AADS',document_key:'ohvis-ui-ux-design-profile-contract',can_approve:true,approval_endpoint:'https://evil.invalid'};
  const event={type:'tool_result',tool_name:'canonical_document_lookup',canonical_document_cards:[card]};
  const extract=exports.canonicalReferencesFromTools;
  const expected=[{project:'AADS',document_key:card.document_key}];
  assert.equal(JSON.stringify(extract([event])),JSON.stringify(expected));
  assert.equal(JSON.stringify(extract(JSON.stringify([event]))),JSON.stringify(expected));
  assert.equal(JSON.stringify(extract([{...event,canonical_document_cards:undefined,content:JSON.stringify({documents:[{approval_card:card}]})} ])),JSON.stringify(expected));
  for(const bad of [[{...event,tool_name:'other'}],[{...event,is_error:true}],[{...event,canonical_document_cards:[{...card,project:'OTHER'}]}],'malformed'])assert.equal(extract(bad).length,0);
});

test('lost approval response recovers authoritative server state and closes without a second approval',async()=>{
  const h=harness();await h.settle();h.open();await h.settle();h.setPostError('lost');
  h.button('정본 승인').props.onClick();await h.settle();
  assert.equal(h.events.length,1);assert.equal(h.calls.at(-1),'GET');
  assert.equal(h.button('정본 승인').props.disabled,true);
  assert.match(h.text(),/승인되었습니다/);
  h.runTimers();await h.settle();assert.equal(h.rendered(),false);
  assert.equal(h.calls.filter(x=>typeof x==='object').length,1);
});
test('cross-tenant or removed document read denial clears previously loaded content',async()=>{
  for(const status of [403,404]){
    const h=harness();await h.settle();h.setGetError(status);
    h.button('새로고침').props.onClick();await h.settle();
    assert.equal(h.button('정본 승인').props.disabled,true);
    assert.equal(h.calls.filter(x=>typeof x==='object').length,0);
  }
});
test('a successful approval schedules exactly one close timer',async()=>{
  const h=harness();await h.settle();h.open();await h.settle();
  h.button('정본 승인').props.onClick();await h.settle();assert.equal(h.pendingTimers(),1);
});

test('viewer requires opening verified content and hides approval outside review', async()=>{
  const h=harness({viewer:true});await h.settle();
  assert.equal(h.button('정본 승인').props.disabled,true);
  h.button('정본 승인').props.onClick();await h.settle();assert.equal(h.events.length,0);
  h.open();await h.settle();assert.equal(h.button('정본 승인').props.disabled,false);
  h.button('정본 승인').props.onClick();await h.settle();assert.equal(h.events.length,1);
  assert.equal(h.rendered(),true);assert.equal(h.pendingTimers(),0);assert.deepEqual(h.approvals,['latest']);
  for(const status of ['draft','approved','archived','removed','missing']) {
    const v=harness({viewer:true,status});await v.settle();assert.equal(v.button('정본 승인'),undefined,status);
    if(status==='draft')assert.match(v.text(),/검토 요청 전 — 작성 세션에서 검토 요청 필요/);
  }
});
test('list badges distinguish drafts, review queue and approval with approval taking precedence',()=>{
  assert.equal(exports.canonicalListStatus(false,false),'초안');
  assert.equal(exports.canonicalListStatus(false,true),'승인 대기');
  assert.equal(exports.canonicalListStatus(true,false),'승인됨');
  assert.equal(exports.canonicalListStatus(true,true),'승인됨');
});
test('queue is fetched once per project including failure; failed queue falls back silently',async()=>{
  const calls=[], warnings=[], out={};
  vm.runInNewContext(code,{exports:out,console:{warn:(...args)=>warnings.push(args)},require(name){
    if(name==='@/lib/api')return {api:{getCanonicalReviewQueue:async project=>{calls.push(project);if(project==='DESIGN')throw Error('offline');return {documents:[{document_key:'a'}]}}}};
    if(name==='@/lib/canonicalProjects')return {CANONICAL_NAV_PROJECTS:['AADS','DESIGN']};
    return {};
  }});
  const cache=new Map();
  const one=out.loadCanonicalReviewQueueOnce(cache,'AADS');
  assert.equal(one,out.loadCanonicalReviewQueueOnce(cache,'AADS'));
  assert.equal(JSON.stringify(await one),'["a"]');
  const failed=out.loadCanonicalReviewQueueOnce(cache,'DESIGN');assert.equal(await failed,null);
  assert.equal(await out.loadCanonicalReviewQueueOnce(cache,'DESIGN'),null);
  assert.deepEqual(calls,['AADS','DESIGN']);assert.equal(warnings.length,1);
  assert.equal(out.canonicalListStatus(false,false),'초안');
});

test('chat card exports use the same extracted component and preserve public helpers',()=>{
  const cards={};vm.runInNewContext(transpile('src/components/chat/CanonicalApprovalCards.tsx'),{exports:cards,require(name){
    if(name==='./CanonicalApprovalPanel')return exports;
    return {};
  }});
  assert.equal(cards.CanonicalApprovalCard,exports.CanonicalApprovalPanel);
  for(const name of ['approvable','reviewable','allowedCanonicalReference','canonicalReferencesFromTools','selectCanonicalCardRefs','shownCanonicalCardIds'])assert.equal(cards[name],exports[name]);
});


test('canonical list groups three revisions and limits review to the latest row', () => {
  const docs = [1, 2, 3].map(revision => ({ project: 'AADS', document_key: 'spec', revision, approved: revision === 1, is_latest: revision === 3, approved_revision: 1, in_review: revision === 3 }));
  const groups = workflow.groupCanonicalDocuments(docs);
  assert.equal(groups.length, 1);
  const { latest, previous, approvedRevision } = groups[0];
  assert.equal(latest.revision, 3);
  assert.equal(previous.length, 2);
  assert.equal(workflow.canonicalLatestWaiting(latest, true), true);
  assert.equal(exports.canonicalListStatus(false, true), '승인 대기');
  assert.equal(exports.canonicalListStatus(false, true, approvedRevision), '승인 대기 (현재 정본: 개정 1)');
  assert.equal(previous.filter(doc => workflow.canonicalLatestWaiting(doc, true)).length, 0);
  assert.equal(workflow.canonicalRevisionApproved(previous[1]), true);
  const panel = fs.readFileSync('src/app/chat/ChatArtifactPanel.tsx', 'utf8');
  const history = panel.slice(panel.indexOf('{previous.map('), panel.indexOf('</details>}', panel.indexOf('{previous.map(')));
  assert.match(history, /<a /);
  assert.doesNotMatch(history, /<button/);
});

test('legacy responses use maximum revision and queue while keeping approved revisions approved', () => {
  const docs = [2, 1, 3].map(revision => ({ project: 'AADS', document_key: 'spec', revision, approved: revision === 1 }));
  const [group] = workflow.groupCanonicalDocuments(docs);
  assert.equal(group.latest.revision, 3);
  assert.equal(group.previous.length, 2);
  assert.equal(group.approvedRevision, 1);
  assert.equal(workflow.canonicalLatestWaiting(group.latest, true), true);
  assert.equal(workflow.canonicalLatestWaiting(group.latest, false), false);
  assert.equal(workflow.canonicalLatestWaiting(docs[1], true), false);
});

test('explicit latest and review fields override revision order and queue', () => {
  const docs = [{project:'AADS', document_key:'spec', revision:2, is_latest:true, in_review:false}, {project:'AADS', document_key:'spec', revision:3, is_latest:false}];
  const [group] = workflow.groupCanonicalDocuments(docs);
  assert.equal(group.latest.revision, 2);
  assert.equal(workflow.canonicalLatestWaiting(group.latest, true), false);
  assert.equal(workflow.canonicalLatestWaiting({...group.latest, in_review:true}, false), true);
  assert.equal(workflow.canonicalLatestWaiting({...group.latest, in_review:true}, true, true), false);
  assert.equal(workflow.canonicalLatestWaiting({...group.latest, approved_revision:2, in_review:true}, true), false);
});

test('one revision stays one row and projects and document keys remain separate', () => {
  const doc = {project:'AADS', document_key:'spec', revision:1};
  const [group] = workflow.groupCanonicalDocuments([doc]);
  assert.equal(group.latest, doc);
  assert.equal(group.previous.length, 0);
  assert.equal(workflow.groupCanonicalDocuments([doc, {...doc, project:'DESIGN'}, {...doc, document_key:'other'}]).length, 3);
  assert.equal(workflow.groupCanonicalDocuments([]).length, 0);
});
