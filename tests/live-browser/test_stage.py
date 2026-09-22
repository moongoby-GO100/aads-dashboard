"""Browser contract regression. Run Vite using vite.config.mjs, then python this file.
Uses simulated WS/API responses; production lane E2E is recorded separately.
"""
import asyncio, base64, json, os
from playwright.async_api import async_playwright, expect

async def main():
 async with async_playwright() as p:
  browser = await p.chromium.launch(headless=True,args=['--no-sandbox'])
  page = await browser.new_page(viewport={'width':1200,'height':1000})
  producer = await browser.new_page(viewport={'width':1000,'height':600})
  await producer.set_content('<body style="background:#eef"><h1>Contract browser frame</h1><input value="test"></body>')
  frame = base64.b64encode(await producer.screenshot()).decode()
  calls=[]; sockets=[]; broken=False
  async def api(route):
   path=route.request.url.split('/api/v1')[-1]
   body=route.request.post_data_json if route.request.method=='POST' else None
   calls.append((path,body))
   if path.startswith('/browser-tasks?'): data={'tasks':[{'id':'task-a','session_id':'test-session','target_url':'https://example.com','status':'running','work_key':'test'}]}
   elif '/live-frame' in path: data={'frame':{'frame_base64':frame,'media_type':'image/png'},'events':[]}
   elif path=='/pc-agent/agents': data={'agents':[{'agent_id':'pc-a','status':'online','hostname':'test-pc'}]}
   elif path=='/pc-agent/execute': data={'command_id':'cmd-a'}
   elif path.startswith('/pc-agent/result/'): data={'status':'success'}
   elif path.endswith('/steps'): data={'step_count':2}
   elif path.endswith('/finish'): data={'status':'pending','registration':{'id':'reg-a'}}
   elif path=='/ohvis/recipes/recording': data={'recording_id':'rec-a'}
   else: data={}
   await route.fulfill(json=data)
  await page.route('**/api/v1/**',api)
  async def websocket(ws):
   sockets.append(ws)
   if broken:
    await ws.close(); return
   ws.send(json.dumps({'type':'frame','frame':frame,'media_type':'image/png','width':1000,'height':600}))
   def receive(raw):
    payload=json.loads(raw); calls.append(('ws',payload))
    if payload.get('type')=='control': ws.send(json.dumps({'type':'control_ack','result':{'recipe_step':{'action':'click','selector':'#demo','risk':'READ'}}}))
   ws.on_message(receive)
  await page.route_web_socket('**/api/v1/**',websocket)
  await page.goto(os.environ.get('LIVE_TEST_URL','http://127.0.0.1:3198'))
  await expect(page.get_by_role('status').first).to_have_text('실시간 연결')
  await page.get_by_role('button',name='학습 시작',exact=True).click()
  image=page.get_by_alt_text('서버 브라우저 실시간 화면')
  await image.click(position={'x':100,'y':100})
  await page.get_by_placeholder('선택한 입력칸에 넣을 값').fill('한글 입력')
  await page.get_by_role('button',name='입력',exact=True).click()
  await page.get_by_role('button',name='Enter',exact=True).click()
  await page.get_by_role('button',name='학습 종료',exact=False).click()
  await expect(page.get_by_text('레시피 등록 요청을 저장했습니다.',exact=False)).to_be_visible()
  assert any(path=='ws' and data.get('action')=='click' for path,data in calls)
  assert any(path=='ws' and data.get('text')=='한글 입력' for path,data in calls)
  await page.get_by_role('button',name='PC Agent',exact=True).click()
  await expect(page.get_by_alt_text('PC 화면 실시간 스트림')).to_be_visible()
  await page.get_by_alt_text('PC 화면 실시간 스트림').click(position={'x':100,'y':100})
  await page.get_by_placeholder('선택한 입력칸에 넣을 값').fill('PC input')
  await page.get_by_role('button',name='입력',exact=True).click()
  await page.get_by_role('button',name='Enter',exact=True).click()
  assert any(path=='/pc-agent/execute' and data['command_type']=='mouse_click' for path,data in calls)
  assert any(path=='/pc-agent/execute' and data['command_type']=='keyboard_type' for path,data in calls)
  assert any(path=='/pc-agent/execute' and data['command_type']=='keyboard_hotkey' for path,data in calls)
  broken=True
  await sockets[-1].close()
  await expect(page.get_by_role('button',name='다시 연결',exact=True)).to_be_visible(timeout=15000)
  await expect(page.get_by_alt_text('PC 화면 실시간 스트림')).to_have_count(0)
  await expect(page.get_by_role('button',name='Enter',exact=True)).to_be_disabled()
  await page.get_by_role('button',name='서버 Playwright',exact=True).click()
  await expect(page.get_by_alt_text('서버 브라우저 실시간 화면')).to_be_visible()
  await page.screenshot(path='/tmp/ohvis-live-contract.png')
  print('PASS: server WS click/type/Enter; PC command/result; recipe start/finish; disconnect disables input; fallback lane isolation')
  await browser.close()
asyncio.run(main())
