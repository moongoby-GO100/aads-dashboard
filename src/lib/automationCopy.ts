// 자동화 화면에 나오는 고정 문장. 일반 화면에는 내부 용어를 쓰지 않는다(FR-27).
// 카드의 제목·본문·버튼 문장은 서버가 만들어 보내고, 여기에는 화면 쪽에서만 쓰는 문장을 둔다.

export const AUTOMATION_EXAMPLES: readonly string[] = [
  "쿠팡이츠에서 어제 매출 받아줘, 매일 아침",
  "스마트스토어 새 주문 있으면 알려줘",
  "홈택스 세금계산서 목록 내려받기, 매주 월요일",
];

// 일반 화면에서 0건이어야 하는 내부 용어. 단어 경계로 검사한다.
export const FORBIDDEN_UI_TERMS: readonly string[] = [
  "work_key", "lane", "credential_scope", "session_id", "recipe", "registration", "e2e", "레인", "레시피",
];

const FORBIDDEN_RE = new RegExp(
  FORBIDDEN_UI_TERMS.map((t) => (/^[a-z0-9_]+$/i.test(t) ? `\\b${t}\\b` : t)).join("|"),
  "i",
);

export function findForbiddenTerm(text: string): string | null {
  const hit = FORBIDDEN_RE.exec(String(text ?? ""));
  return hit ? hit[0] : null;
}

export const REJECT_REASONS: readonly { code: string; label: string }[] = [
  { code: "wrong_date", label: "날짜가 달라요" },
  { code: "wrong_menu", label: "다른 메뉴예요" },
  { code: "wrong_store", label: "다른 매장이에요" },
  { code: "other", label: "그 밖에 달라요" },
];

export const OUTPUT_CHOICES: readonly { code: string; label: string }[] = [
  { code: "table", label: "표" },
  { code: "file", label: "파일" },
  { code: "screen", label: "화면" },
];

export const SCHEDULE_CHOICES: readonly { kind: "once" | "daily" | "weekdays" | "weekly"; label: string }[] = [
  { kind: "once", label: "한 번만" },
  { kind: "daily", label: "매일" },
  { kind: "weekdays", label: "평일" },
  { kind: "weekly", label: "매주" },
];

export const DAY_CHOICES: readonly { code: string; label: string }[] = [
  { code: "mon", label: "월요일" },
  { code: "tue", label: "화요일" },
  { code: "wed", label: "수요일" },
  { code: "thu", label: "목요일" },
  { code: "fri", label: "금요일" },
  { code: "sat", label: "토요일" },
  { code: "sun", label: "일요일" },
];

export const COPY = {
  startTitle: "자동화 만들기",
  startLead: "매일 반복하는 일을 한 문장으로 말해 주세요.",
  startSub: "제가 사이트에 들어가서 한 번 해 보고, 맞는지 보여 드릴게요.",
  startPlaceholder: "하고 싶은 일을 말해 주세요",
  startSubmit: "보내기",
  startExampleTag: "예시",
  startDisabled: "자동화 만들기는 아직 준비 중이에요. 곧 열릴 예정이에요.",
  startNoPermission: "자동화를 만들 권한이 없어요. 담당자에게 요청해 주세요.",
  homeButton: "자동화 만들기",
  homeLead: "반복하는 업무를 한 문장으로 말하면 제가 대신 해 보고 확인받아요.",
  homeBadge: (n: number) => `확인 기다리는 자동화 ${n}건`,
  stepLabel: (n: number) => `확인 ${n} / 3`,
  edit: "고치기",
  save: "저장",
  cancel: "취소",
  siteLabel: "사이트",
  fieldSitePlaceholder: "사이트 이름이나 주소",
  fieldTaskPlaceholder: "할 일",
  domainCheck: (domain: string) => `사이트 주소가 ${domain} 맞나요? 한 번 더 확인해 주세요.`,
  domainOk: "이 주소가 맞아요",
  domainNeeded: "사이트를 먼저 알려 주세요. 사이트 칸의 [고치기]를 눌러 이름이나 주소를 적어 주세요.",
  credentialLead: (host: string) => `${host}에 저장된 로그인이 있어요.`,
  credentialNone: "저장된 로그인이 없어요. 안전한 입력창을 열고 있어요.",
  credentialUse: "이 계정으로 진행",
  credentialOther: "다른 계정으로 로그인",
  credentialVerified: "정상",
  credentialUnverified: "확인 전",
  credentialSafeNote: "안전 입력칸이에요. 입력한 값은 암호화 보관함에만 저장되고, 대화·자동화 기록·화면 캡처에는 남지 않아요.",
  progressWaiting: "화면을 준비하고 있어요. 보통 1~2분 걸려요.",
  progressLive: "실시간 화면",
  progressDone: "마친 단계",
  resultCaption: (time: string) => `마지막 화면 · ${time} 캡처`,
  resultPreviewNote: "아래 표는 읽어 온 내용 중 처음 몇 줄이에요.",
  rejectAsk: "어디가 달라요? 골라 주시면 한 번 다시 해 볼게요.",
  doneHeadline: "자동화를 만들었어요",
  doneSavingHeadline: "자동화를 저장하고 있어요",
  doneStatus: "상태",
  doneRun: "실행",
  doneNoSchedule: "예약 없이 필요할 때 실행해요",
  doneScheduleTitle: "언제 실행할까요?",
  doneScheduleApply: "이 주기로 정하기",
  doneScheduleTime: "시간",
  doneScheduleDay: "요일",
  doneRunStarted: "실행을 시작했어요. 끝나면 채팅으로 알려 드려요.",
  donePaused: "예약 실행을 멈췄어요.",
  doneResume: "예약 다시 켜기",
  doneResumed: "예약 실행을 다시 켰어요.",
  doneScheduleSaved: (text: string, active: boolean) =>
    active ? `${text}에 실행해요.` : `${text} — 담당자가 확인하면 시작해요.`,
  restart: "다시 요청",
  restartHint: "같은 내용으로 처음부터 다시 시작해요.",
  closeCard: "닫기",
  hideProgress: "화면에서 숨기기 (시연은 계속돼요)",
  hideNote: "화면을 숨겨도 시연은 서버에서 계속돼요. 지금은 중간에 멈출 수 없어요.",
  retryDemo: "다시 해 보기",
  relinkLogin: "로그인 다시 연결",
  manualRecord: "직접 보여줄게요",
  credentialConnect: "로그인 연결",
  loadFailed: "자동화 상태를 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.",
  loadMissing: "이 자동화 요청을 찾을 수 없어요.",
  loadDisabled: "자동화 만들기는 아직 준비 중이에요.",
  retryLoad: "다시 불러오기",
  stateChanged: "화면이 바뀌어서 최신 내용으로 새로 불러왔어요.",
  relinkNote: "같은 내용으로 처음부터 다시 시작해서 로그인을 다시 연결할게요.",
  cancelledLocal: "이 카드를 닫았어요.",
  startDemo: "해 보기 시작",
  credentialRequestFailed: "안전 입력창을 열지 못했어요. 잠시 뒤에 다시 시도해 주세요.",
  credentialRetry: "안전 입력창 다시 열기",
  manualStarted: "직접 보여주기를 시작했어요. 화면에서 한 번 해 주세요.",
  closeNote: "카드를 닫아도 진행 중인 일은 서버에서 이어져요. 다시 열려면 채팅을 새로 열어 주세요.",
  schedulePending: "정한 주기는 담당자가 확인하면 시작해요.",
} as const;

export function errorSentence(status: number, code: string): string {
  if (status === 0) return "네트워크 오류예요. 연결을 확인한 뒤 다시 눌러 주세요.";
  if (status === 401) return "로그인이 만료되었어요. 다시 로그인해 주세요.";
  if (status === 403) {
    return code === "admin_required"
      ? "이 단계는 담당자만 할 수 있어요. 담당자에게 요청해 주세요."
      : "이 자동화를 다룰 권한이 없어요.";
  }
  if (status === 404) {
    if (code === "automation_drafts_disabled" || code === "feature_disabled") return COPY.loadDisabled;
    if (code === "session_not_found") return "대화 정보를 찾지 못했어요. 다시 시도해 주세요.";
    return COPY.loadMissing;
  }
  if (status === 409) {
    if (code === "approval_required") return "담당자 확인이 끝나야 실행할 수 있어요.";
    return COPY.stateChanged;
  }
  if (status === 422) {
    switch (code) {
      case "secret_detected": return "비밀번호나 인증 정보는 여기에 쓰지 마세요. 로그인 정보는 안전 입력창에만 넣어 주세요.";
      case "intent_text_invalid": return "하고 싶은 일을 두 글자 이상 적어 주세요.";
      case "task_invalid": return "할 일을 적어 주세요.";
      case "domain_required": return COPY.domainNeeded;
      case "domain_confirmation_required": return "사이트 주소가 맞는지 먼저 확인해 주세요.";
      case "credential_mismatch": return "이 사이트에 쓸 수 없는 계정이에요. 다른 계정을 골라 주세요.";
      case "schedule_invalid":
      case "schedule_kind_invalid":
      case "schedule_time_invalid":
      case "schedule_day_invalid": return "주기와 시간을 다시 확인해 주세요.";
      case "output_invalid": return "받을 결과를 표·파일·화면 중에서 골라 주세요.";
      case "run_not_allowed": return "지금은 실행할 수 없어요. 잠시 뒤에 다시 시도해 주세요.";
      default: return "입력한 내용을 다시 확인해 주세요.";
    }
  }
  if (status === 429) return "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.";
  if (status === 503) return "지금은 예약을 바꿀 수 없어요. 잠시 뒤에 다시 시도해 주세요.";
  return "처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.";
}
