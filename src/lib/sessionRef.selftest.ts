import { extractSessionId } from "./sessionRef";

const SID = "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9";
const WS = "11111111-2222-3333-4444-555555555555";

const cases: Array<{ input: string; expected: string }> = [
  // 대표님이 주소창에서 복사하시는 형태들
  { input: `https://aads.newtalk.kr/chat#${SID}`, expected: SID },
  { input: `https://aads.newtalk.kr/chat?session=${SID}`, expected: SID },
  { input: `/chat/${SID}`, expected: SID },
  { input: SID, expected: SID },
  // 앞뒤 공백은 붙여넣기에서 늘 따라온다
  { input: `  ${SID}\n`, expected: SID },
  // 대문자로 복사돼도 받는다 — DB 는 소문자로 본다
  { input: SID.toUpperCase(), expected: SID },
  // 워크스페이스 id 가 앞에 붙는 주소: 세션 id 는 뒤에 온다
  { input: `https://aads.newtalk.kr/chat?ws=${WS}#${SID}`, expected: SID },
  // 세션 ID 가 없으면 서버까지 보내지 않는다
  { input: "https://aads.newtalk.kr/chat", expected: "" },
  { input: "붙여넣기 실패", expected: "" },
  { input: "", expected: "" },
  // 자리수가 모자란 것은 UUID 가 아니다
  { input: "0a1b2c3d-4e5f-6071-8293-a4b5c6d7e8", expected: "" },
];

for (const item of cases) {
  const actual = extractSessionId(item.input);
  if (actual !== item.expected) {
    throw new Error(
      `extractSessionId(${JSON.stringify(item.input)}) => ${JSON.stringify(actual)}, expected ${JSON.stringify(item.expected)}`,
    );
  }
}

console.log("sessionRef selftest: OK");
