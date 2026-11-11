"""PC/mobile fixture E2E of pending -> verified status; no provider calls."""
import json
import os
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:3321'
OUT = Path('/tmp/fable-settings-evidence')
OUT.mkdir(exist_ok=True)
provider = dict(provider='anthropic', display_name='Anthropic', status='active',
    active_key_count=1, available_key_count=1, rate_limited_key_count=0,
    verified_key_count=1, active_model_count=1, template_model_count=1,
    requires_admin_review=True, auto_discovery_supported=True)
model = dict(provider='anthropic', model_id='claude-fable-5-2', display_name='Fable 5.2',
    is_active=False, is_executable=False, verification_status='review_required',
    metadata=dict(activation_review_reason='http_429', activation_probe=dict(status='failed',
        transient=True, error='http_429', at='2026-11-11T00:00:00Z', next_retry_at='2026-11-11T01:00:00Z')))
queries=[]

def route_api(route):
    u = urlparse(route.request.url)
    path = u.path
    body = {}
    if path.endswith('/auth/me'):
        body=dict(user_id='fixture',email='fixture@example.com',is_admin=True,is_internal_admin=True)
    elif path.endswith('/account-primary'): body=dict(providers={})
    elif path.endswith('/llm-models/providers/summary'):
        body=dict(providers=[provider], review_required_providers=['anthropic'])
    elif path.endswith('/llm-models'):
        if parse_qs(u.query).get('provider') == ['anthropic']:
            queries.append(parse_qs(u.query))
            assert parse_qs(u.query).get('active_only') != ['true']
        body=dict(models=[model])
    elif path.endswith('/discovery-runs'): body=dict(runs=[])
    elif path.endswith('/timeline'): body=dict(timeline=[])
    elif path.endswith('/llm-keys'): body=[]
    elif path.endswith('/llm-keys/overview'): body=dict(summary=dict(action_required=0,codex=dict(usable=0,total=0),anthropic=dict(usable=0,total=0),antigravity=dict(usable=0,total=0),subscription_total=0,apikey_total=0,total=0),accounts=[],providers=[])
    route.fulfill(status=200,content_type='application/json',body=json.dumps(body))

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',args=['--no-sandbox'])
    for width in (1920,390):
        context=browser.new_context(viewport=dict(width=width,height=900))
        context.add_cookies([dict(name='aads_token',value='fixture-only-token',url=BASE)])
        context.add_init_script("localStorage.setItem('aads_token','fixture-only-token')")
        context.route('**/api/v1/**',route_api)
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/settings',wait_until='domcontentloaded',timeout=120000)
        page.get_by_role('button',name='LLM 관리',exact=True).click()
        page.get_by_role('button',name='모델 레지스트리',exact=True).click()
        page.get_by_role('button',name='Anthropic',exact=False).click()
        name=page.get_by_text('Fable 5.2',exact=True)
        expect(name).to_be_visible(timeout=30000)
        card=name.locator('..')
        expect(card).to_contain_text('일시 제한 · 자동 재검증 대기 (http_429)')
        expect(card).to_contain_text('마지막 검증:')
        expect(card).to_contain_text('다음 재시도:')
        expect(card).to_contain_text('KST')
        card.scroll_into_view_if_needed()
        page.screenshot(path=str(OUT/f'pending-{width}.png'),full_page=True)
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        model.update(is_active=True,is_executable=True,verification_status='verified',metadata=dict(activation_probe=dict(status='ok',at='2026-11-11T00:30:00Z')))
        page.get_by_role('button',name='상태 새로고침',exact=True).click()
        expect(page.get_by_text('실행 가능',exact=True)).to_be_visible(timeout=30000)
        expect(page.get_by_text('일시 제한 · 자동 재검증 대기',exact=False)).to_have_count(0)
        page.screenshot(path=str(OUT/f'verified-{width}.png'),full_page=True)
        assert not errors,errors
        print(json.dumps(dict(width=width,pending_visible=True,verified_after_refresh=True,page_errors=errors),ensure_ascii=False))
        model.update(is_active=False,is_executable=False,verification_status='review_required',metadata=dict(activation_review_reason='http_429',activation_probe=dict(status='failed',transient=True,error='http_429',at='2026-11-11T00:00:00Z',next_retry_at='2026-11-11T01:00:00Z')))
        context.close()
    assert len(queries) >= 4
    (OUT/'queries.json').write_text(json.dumps(queries))
    browser.close()
