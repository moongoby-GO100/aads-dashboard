# OHVIS 사이드패널 (Chrome 확장, MV3)

Chrome 옆 패널에서 **승인 대기 · 진행 중 작업 · OHVIS 채팅**을 한 화면으로 보는 확장입니다.
번들러·npm 의존성 없이 순수 HTML/JS/CSS 로 작성되어 있고, 대시보드(Next.js) 빌드와 무관합니다.
서버 변경은 없으며 기존 `https://aads.newtalk.kr/api/v1/browser-tasks` API 만 호출합니다.

## 설치 (개발자 모드)

1. Chrome(116 이상)에서 `chrome://extensions` 를 엽니다.
2. 우측 상단 **개발자 모드**를 켭니다.
3. **압축해제된 확장 프로그램을 로드합니다** → 이 폴더(`extensions/ohvis-sidepanel`)를 선택합니다.
4. 툴바의 OHVIS 아이콘을 누르면 사이드패널이 열립니다. 퍼즐 아이콘에서 고정해 두면 편합니다.
5. `manifest.json` 의 `key`(공개키)로 확장 ID 가 고정됩니다: **`hdohafmpafacecmangkedcbgaoaghcic`** (`chrome-extension://hdohafmpafacecmangkedcbgaoaghcic`). 어느 PC 에서 로드해도 같습니다. 짝이 되는 개인키는 저장소에 없습니다(CRX 서명용이며 압축해제 설치에는 불필요).
6. 코드를 고친 뒤에는 `chrome://extensions` 의 확장 카드에서 새로고침(⟳)을 누릅니다.

툴바의 OHVIS 아이콘을 고정(pin)하고 아이콘을 눌러 사이드패널로 연다. sidepanel.html을 일반 탭으로 열면 브라우저 옆에 붙지 않는다.

## 화면 구성 (위 → 아래)

- **상태줄**: 로그인됨 / 로그인 필요 / 서버 오류 + 마지막 갱신 시각. 로그인이 필요하면 **OHVIS 에 로그인** 버튼이 나타납니다(`https://aads.newtalk.kr/login` 새 탭).
- **승인 대기 · 진행 작업 요약 줄**: 접힌 한 줄씩(예: "승인 대기 4", "진행 작업 2")이며 건수만 보입니다. 승인 대기가 1건 이상이면 강조색으로 표시되지만 자동으로 펼쳐지지 않습니다. 펼친 본문은 화면 높이의 40% 까지만 차지하고 넘치면 스크롤됩니다. 아래 채팅이 남은 높이를 모두 씁니다.
- **승인 대기**(펼쳤을 때): 작업·사이트·사유와 [승인] [거부]. 거부는 한 번 더 눌러야 실행됩니다(5초 안에 확인).
- **진행 작업**(펼쳤을 때): 최근 10건(상태·대상 사이트·마지막 단계). 항목을 누르면 진행 단계·이벤트·실시간 화면이 펼쳐지고 [다시 시도] 를 쓸 수 있습니다.
- **OHVIS 채팅**: `https://aads.newtalk.kr/chat` 을 iframe 으로 표시. [패널에서 숨기기] 로 접으면 [OHVIS 채팅 열기](새 탭) 버튼으로 바뀌며, 선택은 저장됩니다. 숨긴 상태에서는 승인·작업 영역이 남은 높이를 씁니다.

패널이 보일 때만 10초마다 갱신하고, 실패하면 20 → 40 → 60초로 간격을 늘립니다(최대 60초). 패널이 다시 보이거나 로그인 쿠키가 바뀌면 즉시 갱신합니다.

## 인증

별도 로그인 화면이 없습니다(비밀번호 입력 UI 없음). 이미 `aads.newtalk.kr` 에 로그인돼 있으면 `aads_token` 쿠키를 `chrome.cookies` 로 읽어
`Authorization: Bearer` 로 보냅니다. 서버(`require_tenant_role` → `get_current_user`)가 Bearer 를 우선 받습니다.
토큰은 메모리에서만 쓰고 저장·로그 출력하지 않습니다. 401 이면 로그인 버튼을 보여 줍니다.

### 채팅 iframe 로그인 전달

패널 안 iframe 은 제3자 맥락이라 `SameSite=Lax` 쿠키가 가지 않습니다. 그래서 iframe 은 `https://aads.newtalk.kr/ext-auth.html` 로 열리고,
로드되면 패널이 `postMessage({type:"ohvis-auth", token}, "https://aads.newtalk.kr")` 로 토큰을 보냅니다(targetOrigin 고정, `*` 금지).
브리지 페이지는 부모 창에서 온 `chrome-extension://<고정 ID>` origin 의 JWT 형식 토큰만 받아 localStorage 와 파티션 쿠키
(`Secure; SameSite=None; Partitioned`)에 저장한 뒤 `/chat` 으로 이동합니다. 5초 안에 토큰이 없으면 [OHVIS 에 로그인] 링크(새 탭)를 보여 줍니다.
로그아웃·401 상태에서는 토큰을 보내지 않습니다. 최상위 창의 로그인·쿠키 동작은 그대로입니다.

## 권한 설명

| 권한 | 이유 |
| --- | --- |
| `sidePanel` | 툴바 아이콘 클릭 시 사이드패널 표시 |
| `storage` | 채팅 표시 방식(패널/새 탭) 선택 저장 |
| `cookies` | `aads.newtalk.kr` 의 `aads_token` 읽기(로그인 재사용) 및 로그인 완료 감지 |
| host `https://aads.newtalk.kr/*` | 위 API 호출, 쿠키 접근, 채팅 iframe |

## 알려진 제한

- 채팅 iframe 로그인은 `Partitioned` 쿠키를 지원하는 Chrome(114 이상, 이 확장은 116 이상)을 전제로 합니다. 미지원이거나 서드파티 쿠키가 차단되면 iframe 이 로그인 화면으로 갈 수 있으니 [새 탭에서 열기] 를 쓰세요.
- 대시보드 로그아웃은 일반 쿠키만 지우므로, 패널 안 파티션 쿠키는 만료(7일)되거나 패널이 새 토큰을 보낼 때까지 남을 수 있습니다.
- 승인 요청의 "사유" 는 서버가 별도 필드를 주지 않아 위험도 기반 문구로 표시합니다.
- 승인은 기본 범위·횟수(서버 기본값)로만 처리합니다. 범위/횟수 조정 UI 는 없습니다.
- 작업 생성(POST), 실시간 원격 조작(WebSocket live-stream)은 이 MVP 범위가 아닙니다.
- Chrome 외 브라우저, 웹스토어 배포는 범위 밖입니다.

## 검증

```bash
node --test extensions/ohvis-sidepanel/tests      # manifest 검사 + API/포맷 단위 테스트(fetch 목)
node extensions/ohvis-sidepanel/scripts/make-icons.mjs   # 아이콘 재생성(선택)
```

## 설치 후 확인 체크리스트 (실제 Chrome)

- [ ] `chrome://extensions` 에서 오류 없이 로드되고, 아이콘 클릭 시 사이드패널이 열린다.
- [ ] 로그아웃 상태: 상태줄이 "로그인이 필요합니다", [OHVIS 에 로그인] 이 새 탭으로 `/login` 을 연다. 로그인 후 패널이 자동 갱신된다.
- [ ] 로그인 상태: 상태줄 "로그인됨 · 정상 연결", 마지막 갱신 시각이 10초마다 바뀐다.
- [ ] 패널을 닫았다 열면 즉시 갱신되고, 패널이 숨겨진 동안 `aads.newtalk.kr` 로 요청이 나가지 않는다(DevTools → 서비스 워커/패널 Network).
- [ ] 승인 대기 카드: 작업·사이트·사유가 보이고 [승인] 후 목록에서 사라진다. [거부] 는 두 번째 클릭("정말 거부")에서만 실행된다.
- [ ] 진행 중 작업 10건 이내로 표시, 항목 클릭 시 단계/이벤트/실시간 화면(있을 때)이 보인다.
- [ ] 실패한 작업에서 [다시 시도] 가 `queued` 로 바뀌고, 진행 중/승인 대기 작업에서는 비활성이다.
- [ ] 로그인 상태에서 채팅 iframe 이 `/login` 을 거치지 않고 채팅 화면을 보여 주는가? 로그아웃 상태에서는 5초 뒤 [OHVIS 에 로그인] 링크가 보이는가? [새 탭에서 열기] 는 항상 동작해야 한다.
- [ ] 서버를 일시 차단했을 때 상태줄에 사람 말 오류와 재시도 간격이 나오고, 복구되면 자동으로 정상으로 돌아온다.
- [ ] DevTools Console/Network 어디에도 토큰 값이 출력되지 않는다(Authorization 헤더 제외).
