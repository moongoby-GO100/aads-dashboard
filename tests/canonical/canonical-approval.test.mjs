import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync('src/components/chat/CanonicalApprovalCards.tsx', 'utf8');
const code = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exports = {};
vm.runInNewContext(code, {exports, require(name) {
  if(name==='@/lib/canonicalProjects')return {CANONICAL_NAV_PROJECTS:['AADS','DESIGN']};
  return {};
}});
const {approvable, allowedCanonicalReference} = exports;
const detail = () => ({approval_card:{type:'canonical_document_approval',schema_version:1,project:'AADS',document_key:'ohvis-ui-ux-design-profile-contract',can_approve:true,revision_id:'latest',generation:12},status:'review',document:{document_key:'ohvis-ui-ux-design-profile-contract',generation:12,latest_revision_id:'latest',approved_revision_id:null},revision:{id:'latest'}});
test('approval requires explicit server capability and current, unapproved, available revision',()=>{
  assert.equal(approvable(detail()),true);
  for(const patch of [{approval_card:null},{approval_card:{...detail().approval_card,schema_version:2}},{approval_card:{...detail().approval_card,generation:11}},{approval_card:{...detail().approval_card,document_key:'unknown'}},{approval_card:{...detail().approval_card,can_approve:false}},{approval_card:{...detail().approval_card,can_approve:undefined}},{approval_card:{...detail().approval_card,can_approve:'true'}},{revision:null},{status:'removed'},{status:'archived'},{status:'missing'}])assert.equal(approvable({...detail(),...patch}),false);
  for(const patch of [{latest_revision_id:'newer'},{approved_revision_id:'latest'},{generation:0},{generation:-1},{generation:1.2},{generation:NaN}]){const d=detail();Object.assign(d.document,patch);assert.equal(approvable(d),false);}
});
test('allowlisted reference ignores arbitrary endpoints and rejects project/key injection',()=>{
  const key='ohvis-ui-ux-design-profile-contract';
  assert.equal(allowedCanonicalReference({project:'AADS',document_key:key,endpoint:'https://evil.invalid/approve'}),true);
  for(const project of ['../AADS','https://evil.invalid','AADS/documents','aads','OTHER'])assert.equal(allowedCanonicalReference({project,document_key:key}),false);
  for(const document_key of ['../approve','unknown','ohvis-ui-ux-design-profile-contract/approve'])assert.equal(allowedCanonicalReference({project:'AADS',document_key}),false);
  for(const document_key of ['ohvis-ui-ux-asset-audit-requirements','ohvis-ui-ux-g6-token-tenant-isolation-draft'])assert.equal(allowedCanonicalReference({project:'AADS',document_key}),true);
});

// Execute production handlers with a minimal hook host; no HTTP or production data.
function harness() {
  const states=[], effects=[];
  let cursor=0, tree, scheduled=false;
  const current=detail();current.revision.version='12.0.0';current.revision.content='격리 본문';
  const calls=[], events=[];
  let postError=0, getError=0;
  const api={
    async getCanonicalDocument(){calls.push('GET');if(getError)throw Error(`API error ${getError}`);return structuredClone(current)},
    async decideCanonicalDocument(project,key,action,revision,generation){
      calls.push({project,key,action,revision,generation});
      await Promise.resolve();if(postError && postError!=='lost')throw Error(`API error ${postError}`);
      current.document.approved_revision_id=revision;current.approval_card.can_approve=false;current.status='approved';events.push({action:'approved',actor:'isolated-human',revision});
      if(postError==='lost')throw Error('network response lost');
    },
  };
  const jsx=(type,props)=>({type,props});
  const hooks={
    useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>{states[i]=v;if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;render()})}}]},
    useRef(initial){const i=cursor++;return states[i]??(states[i]={current:initial})},
    useEffect(effect){const i=cursor++;if(!(i in states)){states[i]=true;effects.push(effect)}},
  };
  const out={};vm.runInNewContext(code,{exports:out,Set,Map,Number,require(name){
    if(name==='react')return hooks;
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(name==='@/lib/api')return {api};
    if(name==='@/lib/canonicalProjects')return {CANONICAL_NAV_PROJECTS:['AADS']};
    return {default:()=>null,statusTone:x=>x};
  }});
  const list=out.default({documents:[{project:'AADS',document_key:'ohvis-ui-ux-design-profile-contract'}]});
  const card=list.props.children[0];
  function render(){cursor=0;tree=card.type(card.props);while(effects.length)effects.shift()()}
  function nodes(node,predicate){if(!node||typeof node!=='object')return [];const found=predicate(node)?[node]:[];return found.concat([node.props?.children].flat(Infinity).flatMap(child=>nodes(child,predicate)))}
  render();
  return {current,calls,events,setPostError:v=>postError=v,setGetError:v=>getError=v,
    async settle(){for(let i=0;i<12;i++)await Promise.resolve()},
    button(name){return nodes(tree,n=>n.type==='button'&&n.props.children===name)[0]},
    open(){nodes(tree,n=>n.type==='details')[0].props.onToggle({currentTarget:{open:true}})},
  };
}
test('production handlers verify current state, block double click, and read approved state',async()=>{
  const h=harness();await h.settle();h.open();await h.settle();
  const approve=h.button('정본 승인');approve.props.onClick();approve.props.onClick();await h.settle();
  assert.equal(h.calls.filter(x=>typeof x==='object').length,1);
  assert.deepEqual(h.events,[{action:'approved',actor:'isolated-human',revision:'latest'}]);
  assert.equal(h.calls.at(-1),'GET');assert.equal(h.button('정본 승인').props.disabled,true);
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

test('lost approval response recovers authoritative server state without a second approval',async()=>{
  const h=harness();await h.settle();h.open();await h.settle();h.setPostError('lost');
  h.button('정본 승인').props.onClick();await h.settle();
  assert.equal(h.events.length,1);assert.equal(h.calls.at(-1),'GET');
  assert.equal(h.button('정본 승인').props.disabled,true);
  h.setPostError(0);h.button('새로고침').props.onClick();await h.settle();
  h.open();await h.settle();assert.equal(h.button('정본 승인').props.disabled,true);
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
