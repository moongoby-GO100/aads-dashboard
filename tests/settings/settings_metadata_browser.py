"""Local fixture E2E; never validates production login or real provider quota.

Run the dashboard dev server on 127.0.0.1:3312, then:
  python3 tests/settings/settings_metadata_browser.py
Requires the Python Playwright package and its Chromium installation.
AADS_SETTINGS_TEST_URL and AADS_SETTINGS_EVIDENCE_DIR override local test paths.
"""
import os
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('AADS_SETTINGS_TEST_URL', 'http://127.0.0.1:3312').rstrip('/')
if urlparse(BASE).hostname not in ('localhost', '127.0.0.1'):
    raise SystemExit('Fixture tests require a local server; production targets are forbidden')
OUT = Path(os.environ.get('AADS_SETTINGS_EVIDENCE_DIR', '/tmp/aads-settings-evidence'))
OUT.mkdir(exist_ok=True)
account = dict(provider='antigravity', key_name='ANTIGRAVITY_HOST', label='Google 구독 (Antigravity)',
    actual_account='settings.fixture@example.com', account_verified=False, account_source='agy_credential_metadata',
    priority=None, is_active=True, toggleable=False, kind='subscription', masked_value='', slot=None,
    state='ok', bound=True, needs_login=False, login_in_progress=False, login_target=None,
    subscription=None, rate_limited_until=None, used_percent=None, resets_at=None,
    snapshot_age_hours=None, ok_72h=None, limit_72h=None, notes=None,
    usage_status='unsupported', usage_collected_at=None, windows=[])
provider = dict(provider='openai', display_name='OpenAI', status='active', active_key_count=1,
    available_key_count=1, rate_limited_key_count=0, verified_key_count=1, active_model_count=2,
    template_model_count=2, linked_key_name=None, requires_admin_review=False, auto_discovery_supported=True)
summary = dict(providers=[provider], total=1, active_provider_count=1, rate_limited_provider_count=0,
    review_required_providers=[], last_sync_at='2026-11-01T23:00:00Z', last_sync_reason='scheduled',
    last_sync_actor='system', normalized_providers={})
models = [dict(provider='openai', model_id='gpt-4.1', display_name='GPT-4.1', release_date='2025-04-14',
    release_date_source='https://openai.com/index/gpt-4-1/', release_date_verified_at='2026-10-30T11:08:43Z'),
    dict(provider='openai', model_id='unknown-release', display_name='출시일 근거 없는 모델')]
runs = [dict(id=i, provider=p, status=s, error=e, created_at='2026-11-01T23:00:00Z', discovered_count=3)
    for i,p,s,e in [(1,'openai','ok',None), (2,'anthropic','skipped','oauth_runtime_only_models_api_unavailable'),
    (3,'gemini','skipped','google_routes_disabled'), (4,'kimi','failed','provider_error')]]
state = {'discovery_fail':False}
requests = []

def route_api(route):
    req = route.request
    path = urlparse(req.url).path
    requests.append({'path':path, 'method':req.method})
    if req.method == 'OPTIONS':
        route.fulfill(status=204, headers={'Access-Control-Allow-Origin':req.headers.get('origin',BASE),'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'*'})
        return
    body = {}
    status = 200
    if path.endswith('/auth/me'):
        body = dict(user_id='fixture', email='fixture@example.com', is_admin=True, is_internal_admin=True)
    elif path.endswith('/llm-keys/overview'):
        body = dict(summary=dict(action_required=0, codex=dict(usable=0,total=0), anthropic=dict(usable=0,total=0),
            antigravity=dict(usable=1,total=1), subscription_total=1, apikey_total=0,total=1,bindings_available=True,collected_at='2026-11-01T23:00:00Z'), accounts=[account], providers=[])
    elif path.endswith('/account-primary'): body = {'providers':{}}
    elif path.endswith('/llm-models/providers/summary'): body = summary
    elif path.endswith('/llm-models/discovery-runs'):
        if state['discovery_fail']: status=503
        body = {'runs':runs,'total':len(runs)}
    elif path.endswith('/llm-models'): body = {'models':models}
    elif path.endswith('/timeline'): body = {'timeline':[]}
    elif path.endswith('/llm-keys'): body = []
    elif path.endswith('/health'): body = dict(status='ok',version='fixture')
    route.fulfill(status=status, content_type='application/json', body=json.dumps(body), headers={'Access-Control-Allow-Origin':req.headers.get('origin',BASE),'Access-Control-Allow-Credentials':'true'})

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for name,width,height in [('pc',1920,911),('mobile',360,800)]:
        context = browser.new_context(viewport={'width':width,'height':height})
        context.add_cookies([{'name':'aads_token','value':'fixture-only-token','url':BASE}])
        context.add_init_script("localStorage.setItem('aads_token','fixture-only-token')")
        context.route('**/api/v1/**', route_api)
        page = context.new_page()
        errors=[]
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'{BASE}/settings',wait_until='networkidle',timeout=120000)
        page.get_by_role('button',name='LLM 관리',exact=True).click()
        expect(page.get_by_text('settings.fixture@example.com',exact=True)).to_be_visible()
        expect(page.get_by_text('구독 사용량 조회 미지원',exact=True)).to_be_visible()
        assert page.get_by_text('기록 없음 — 첫 호출 후 표시').count()==0
        page.screenshot(path=str(OUT/f'{name}-account.png'),full_page=True)
        for usage_status,expected_text in [('collection_failed','구독 사용량 수집 실패'),('not_measured','구독 사용량 미측정'),('available','사용 35.0%')]:
            account.update(usage_status=usage_status,usage_collected_at='2026-11-01T23:00:00Z',windows=[dict(window_minutes=300,used_percent=35,resets_at='2026-11-02T02:00:00Z')])
            page.get_by_role('button',name='새로고침',exact=True).click()
            expect(page.get_by_text(expected_text,exact=False)).to_be_visible()
        page.screenshot(path=str(OUT/f'{name}-quota-fixture.png'),full_page=True)
        page.get_by_role('button',name='모델 레지스트리',exact=True).click()
        expect(page.get_by_text('anthropic · 건너뜀',exact=True)).to_be_visible()
        expect(page.get_by_text('kimi · 실패',exact=True)).to_be_visible()
        expect(page.get_by_text('OAuth 계정은 모델 목록 API를 지원하지 않습니다',exact=True)).to_be_visible()
        page.get_by_role('button',name='OPENAI',exact=False).click()
        expect(page.locator('time[datetime="2025-04-14"]')).to_be_visible()
        expect(page.get_by_text('출시일 미확인',exact=True)).to_be_visible()
        expect(page.get_by_role('link',name='출처',exact=True)).to_have_attribute('href','https://openai.com/index/gpt-4-1/')
        page.locator('time[datetime="2025-04-14"]').scroll_into_view_if_needed()
        page.screenshot(path=str(OUT/f'{name}-models.png'),full_page=True)
        state['discovery_fail']=True
        page.get_by_role('button',name='상태 새로고침',exact=True).click()
        expect(page.locator('p[role=alert]')).to_contain_text('자동 갱신 이력을 불러오지 못했습니다')
        state['discovery_fail']=False
        page.get_by_role('button',name='상태 새로고침',exact=True).click()
        expect(page.get_by_text('anthropic · 건너뜀',exact=True)).to_be_visible()
        overflow=page.evaluate('document.documentElement.scrollWidth > innerWidth')
        assert not overflow, f'{name}: page overflow'
        assert not errors, errors
        print(json.dumps(dict(kind='fixture', viewport=name, result='passed', page_errors=errors, page_overflow=overflow),ensure_ascii=False))
        account.update(usage_status='unsupported',usage_collected_at=None,windows=[])
        context.close()
    (OUT/'requests.json').write_text(json.dumps(requests,indent=2))
    browser.close()
