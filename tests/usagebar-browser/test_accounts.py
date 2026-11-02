"""Browser regression: account visibility uses overview, including stale legacy data.
Run Vite with this directory and vite.config.mjs on 127.0.0.1:3314 first.
"""
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:3314'
OUT = Path('/tmp/aads-chat-accounts-evidence-20261102')
OUT.mkdir(exist_ok=True)
accounts = [
    dict(key_name='CLAUDE_ON',provider='anthropic',label='Active Claude',slot='slot1',priority=1,is_active=True,state='ok',windows=[]),
    dict(key_name='CLAUDE_OFF',provider='anthropic',label='Disabled Claude',slot=None,priority=2,is_active=False,manual_disabled=True,state='inactive',windows=[]),
    dict(key_name='CODEX_ON',provider='codex',label='Active Codex',slot=None,priority=1,is_active=True,state='ok',windows=[]),
    dict(key_name='CODEX_OFF',provider='codex',label='Disabled Codex',slot=None,priority=2,is_active=False,manual_disabled=True,state='inactive',windows=[]),
    dict(key_name='ANTIGRAVITY_HOST',provider='antigravity',label='Google subscription',actual_account='agy.fixture@example.com',slot=None,priority=1,is_active=True,state='ok',usage_status='unsupported',windows=[]),
]
state = {'fail':False}

def route_api(route):
    path = urlparse(route.request.url).path
    data = {}
    status = 200
    if path.endswith('/overview'):
        data = {'accounts':accounts}
        if state['fail']: status=503
    elif path.endswith('/account-primary'):
        # Deliberately stale: still claims the disabled Codex is active.
        data = {'providers':{p:{'primary':p+'_ON','mode':'manual','accounts':[
            {**a,'is_active':True,'has_quota':True,'headroom_pct':50} for a in accounts if a['provider']==p
        ]} for p in ['anthropic','codex']}}
    elif path.endswith('/usage-stats'):
        data = {'token_labels':[dict(slot='1',key_name='CLAUDE_ON',priority=1)],
                'claude_slots':[dict(slot=str(n),label=label,enabled=True,primary={'used_percent':10},secondary={'used_percent':20})
                                for n,label in [(1,'Active Claude'),(2,'Disabled Claude'),(4,'Orphan stale slot')]],
                'claude_max':{'primary':{'used_percent':10},'secondary':{'used_percent':20}}}
    elif path.endswith('/codex-usage'):
        data = {'ok':True,'limits':[dict(limit_id='legacy-unattributed',primary={'used_percent':50})]}
    elif path.endswith('/relay-capacity'):
        data = dict(status='ok',used=1,max_concurrent=15,available=14,usage_percent=7,active_leases={'claude':1,'codex':0})
    elif path.endswith('/workspaces'): data = {'workspaces':[]}
    route.fulfill(status=status,content_type='application/json',body=json.dumps(data),headers={
        'Access-Control-Allow-Origin':BASE,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Methods':'GET, POST, OPTIONS'})

results = []
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    for name,width,height in [('pc',1920,911),('mobile',360,800)]:
        for a in accounts: a['is_active'] = a['key_name'] not in ('CLAUDE_OFF','CODEX_OFF')
        state['fail']=False
        ctx=browser.new_context(viewport={'width':width,'height':height})
        ctx.add_init_script("localStorage.setItem('aads_token','fixture')")
        ctx.route('**/api/v1/**',route_api)
        page=ctx.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE,wait_until='networkidle')
        expect(page.locator('[data-usage-account="ANTIGRAVITY_HOST"]')).to_contain_text('agy.fixture')
        expect(page.get_by_text('사용량 조회 미지원',exact=True)).to_be_visible()
        assert 'Disabled' not in page.locator('body').inner_text()
        page.screenshot(path=str(OUT/f'{name}-collapsed.png'))
        page.get_by_role('button',name='사용량 바 펼치기').click()
        expect(page.get_by_role('button',name='Active Claude',exact=False)).to_be_visible()
        assert 'Disabled' not in page.locator('body').inner_text()
        assert 'Orphan' not in page.locator('body').inner_text()
        assert 'legacy-unattributed' not in page.locator('body').inner_text()
        expect(page.locator('[data-usage-account="ANTIGRAVITY_HOST"]')).to_be_visible()
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
        page.screenshot(path=str(OUT/f'{name}-expanded.png'))
        # Settings changed while chat was away: focus refresh hides all accounts,
        # even though usage-stats and account-primary still return old data.
        for a in accounts:a['is_active']=False
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        expect(page.locator('[data-usage-account]')).to_have_count(0)
        expect(page.get_by_role('button',name='Active Claude',exact=False)).to_have_count(0)
        assert 'Claude' not in page.locator('body').inner_text()
        assert 'Codex' not in page.locator('body').inner_text()
        state['fail']=True
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        expect(page.locator('[data-usage-account]')).to_have_count(0)
        assert not errors,errors
        results.append(dict(viewport=name,disabled_hidden=True,orphan_hidden=True,antigravity=True,focus_refresh=True,all_disabled=True,errors=errors))
        ctx.close()
    browser.close()
(OUT/'fixture-result.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
