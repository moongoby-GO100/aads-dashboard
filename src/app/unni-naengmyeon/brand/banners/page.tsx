import type { Metadata } from "next";
import Image from "next/image";
import BrandNav from "../BrandNav";
import styles from "./page.module.css";

const ASSET_ROOT = "/brands/unni-naengmyeon/banners-20260722";
const BRAND_LOGO = "/brands/unni-naengmyeon/bowlcut-logo-concepts-20260722/concept-h-wordmark-noodles.png";

type ConceptTone = "classic" | "night" | "ice" | "premium" | "coral";

type OutdoorConcept = {
  id: string;
  tone: ConceptTone;
  name: string;
  summary: string;
  image: string;
  frontTitle: React.ReactNode;
  frontSub: string;
  direction: string;
  backTitle: React.ReactNode;
  menuMode: "single" | "set";
};

const singleMenu = [
  ["외할머니 명태회냉면", "13,000원"],
  ["물비냉 언니냉면", "10,500원"],
  ["물냉면", "10,000원"],
  ["비빔냉면", "10,000원"],
];

const setMenu = [
  ["냉면 + 수제돈까스", "15,500원"],
  ["냉면 + 찐만두", "15,000원"],
  ["냉면 + 몽땅 SET", "19,500원"],
];

const outdoorConcepts: OutdoorConcept[] = [
  {
    id: "a",
    tone: "classic",
    name: "픽업 비콘",
    summary: "기사 동선 안내와 포장 메뉴를 앞·뒤로 분리한 최우선 추천안",
    image: "concept-a-classic-food.png",
    frontTitle: <>배달·포장<br /><em>픽업은 이쪽</em></>,
    frontSub: "배달기사님 · 포장 고객님 환영합니다",
    direction: "매장 안쪽  →",
    backTitle: <>보고 고르고<br /><em>바로 포장</em></>,
    menuMode: "single",
  },
  {
    id: "b",
    tone: "night",
    name: "나이트 라이더",
    summary: "야간에도 멀리서 읽히는 딥그린·화이트·코랄 고대비안",
    image: "concept-b-bold-food.png",
    frontTitle: <>언니냉면<br /><em>PICK UP</em></>,
    frontSub: "배달기사 픽업 · 포장 주문",
    direction: "입구 방향  →",
    backTitle: <>시원한 한 끼<br /><em>포장됩니다</em></>,
    menuMode: "single",
  },
  {
    id: "c",
    tone: "ice",
    name: "아이스 팝",
    summary: "밝은 실외 환경과 젊은 유동 고객에게 강한 청량 그래픽안",
    image: "concept-c-fresh-food.png",
    frontTitle: <>배달·포장<br /><em>픽업존</em></>,
    frontSub: "주문번호를 준비해 주세요",
    direction: "PICK UP  →",
    backTitle: <>혼자도 둘이도<br /><em>푸짐하게</em></>,
    menuMode: "set",
  },
  {
    id: "d",
    tone: "premium",
    name: "프리미엄 콜드",
    summary: "새로 추가한 프리미엄 이미지 중심 시안. 브랜드 인지도와 메뉴 품질 강조",
    image: "concept-d-premium-cold.png",
    frontTitle: <>제대로 만든<br /><em>언니냉면</em></>,
    frontSub: "배달기사 · 포장 고객 픽업",
    direction: "PICK UP  →",
    backTitle: <>차갑게, 깊게<br /><em>한 그릇</em></>,
    menuMode: "single",
  },
  {
    id: "e",
    tone: "coral",
    name: "코랄 마켓",
    summary: "새로 추가한 포장 구매 전환형 시안. 밝고 친근한 메뉴판 구성",
    image: "concept-e-coral-bibim.png",
    frontTitle: <>냉면 생각날 땐<br /><em>언니냉면</em></>,
    frontSub: "배달 픽업 · 방문 포장",
    direction: "주문·픽업  →",
    backTitle: <>오늘 뭐 먹지?<br /><em>언니가 챙길게</em></>,
    menuMode: "set",
  },
];

const pickupConcepts = [
  {
    id: "p1",
    name: "아이스 클리어",
    summary: "유리창 너머에서도 밝고 청량하게 보이는 기본 추천안",
    image: "concept-p1-ice-blue.png",
    tone: "pickupIce",
    eyebrow: "DELIVERY · TAKE OUT",
    title: <>배달·포장<br /><em>픽업존</em></>,
    guide: "주문번호 확인 후 픽업",
  },
  {
    id: "p2",
    name: "라이더 애로우",
    summary: "빠르게 이동하는 배달기사가 한눈에 방향을 인지하는 고대비안",
    image: "concept-p2-rider-arrow.png",
    tone: "pickupNight",
    eyebrow: "배달기사님, 여기입니다",
    title: <>배달·포장<br /><em>픽업존</em></>,
    guide: "픽업은 이쪽  →",
  },
  {
    id: "p3",
    name: "웰컴 패키지",
    summary: "포장 고객에게 친근하고 매장 분위기와 자연스럽게 어울리는 안",
    image: "concept-p3-friendly-pack.png",
    tone: "pickupCream",
    eyebrow: "어서 오세요",
    title: <>배달·포장<br /><em>픽업존</em></>,
    guide: "포장 주문 · 배달 픽업",
  },
];

export const metadata: Metadata = {
  title: "언니냉면 600×1800 양면 입간판 · 픽업존 시안",
  description: "실외 600×1800mm 양면 입간판 5안과 실내 유리용 600×600mm 픽업존 3안입니다.",
};

function BannerLogo({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`${styles.bannerLogo} ${inverse ? styles.inverseLogo : ""}`}>
      <Image src={BRAND_LOGO} alt="언니냉면 컨셉 H 로고" width={1254} height={1254} />
      <strong>언니냉면</strong>
    </div>
  );
}

function DownloadLink({ file, children }: { file: string; children: React.ReactNode }) {
  return <a className={styles.download} href={`${ASSET_ROOT}/print/${file}`} download>{children}</a>;
}

function ProductionGuides({ square = false }: { square?: boolean }) {
  return (
    <div className={`${styles.guides} ${square ? styles.squareGuides : ""}`} aria-hidden="true">
      <span className={styles.safeLabel}>{square ? "사방 30mm 안전영역" : "상·하 80mm 가공 유보 / 사방 30mm 안전영역"}</span>
    </div>
  );
}

function MenuBoard({ mode }: { mode: "single" | "set" }) {
  const rows = mode === "single" ? singleMenu : setMenu;
  return (
    <div className={styles.menuBoard}>
      <span>TAKE OUT MENU</span>
      {rows.map(([name, price]) => <div key={name}><b>{name}</b><strong>{price}</strong></div>)}
      <small>매장 상황에 따라 메뉴·가격이 변경될 수 있습니다</small>
    </div>
  );
}

function OutdoorConceptCard({ concept }: { concept: OutdoorConcept }) {
  const inverse = concept.tone === "night" || concept.tone === "premium";
  return (
    <article className={styles.concept}>
      <div className={styles.conceptHeading}>
        <div><span>CONCEPT {concept.id.toUpperCase()}</span><h2>{concept.name}</h2></div>
        <p>{concept.summary}</p>
      </div>
      <div className={styles.pair}>
        <div>
          <div className={`${styles.banner} ${styles[concept.tone]} ${styles.front}`} data-export={`outdoor-${concept.id}-front`}>
            <Image className={styles.coverImage} src={`${ASSET_ROOT}/${concept.image}`} alt="" fill sizes="600px" priority={concept.id === "a"} />
            <div className={styles.frontShade} />
            <div className={styles.bannerInner}>
              <BannerLogo inverse={inverse} />
              <div className={styles.frontCopy}>
                <span>DELIVERY · TAKE OUT</span>
                <h3>{concept.frontTitle}</h3>
                <p>{concept.frontSub}</p>
              </div>
              <div className={styles.direction}>{concept.direction}</div>
              <div className={styles.location}>서울 성북구 동소문로 90 1층</div>
            </div>
            <ProductionGuides />
          </div>
          <DownloadLink file={`outdoor-${concept.id}-front.png`}>{concept.id.toUpperCase()} 앞면 PNG</DownloadLink>
        </div>
        <div>
          <div className={`${styles.banner} ${styles[concept.tone]} ${styles.back}`} data-export={`outdoor-${concept.id}-back`}>
            <Image className={styles.backImage} src={`${ASSET_ROOT}/${concept.image}`} alt="" fill sizes="600px" />
            <div className={styles.backShade} />
            <div className={styles.bannerInner}>
              <BannerLogo inverse={inverse} />
              <div className={styles.backCopy}><span>UNNI&apos;S CHOICE</span><h3>{concept.backTitle}</h3></div>
              <MenuBoard mode={concept.menuMode} />
              <div className={styles.backPickup}><b>배달기사 픽업 · 방문 포장</b><strong>입구 방향  →</strong></div>
            </div>
            <ProductionGuides />
          </div>
          <DownloadLink file={`outdoor-${concept.id}-back.png`}>{concept.id.toUpperCase()} 뒷면 PNG</DownloadLink>
        </div>
      </div>
    </article>
  );
}

function PickupConceptCard({ concept }: { concept: typeof pickupConcepts[number] }) {
  return (
    <article className={styles.pickupConcept}>
      <div><span>INDOOR {concept.id.toUpperCase()}</span><h3>{concept.name}</h3><p>{concept.summary}</p></div>
      <div className={`${styles.pickupBanner} ${styles[concept.tone]}`} data-export={`indoor-${concept.id}`}>
        <Image className={styles.pickupImage} src={`${ASSET_ROOT}/pickup/${concept.image}`} alt="" fill sizes="600px" />
        <div className={styles.pickupShade} />
        <div className={styles.pickupInner}>
          <BannerLogo inverse={concept.id === "p2"} />
          <span>{concept.eyebrow}</span>
          <h4>{concept.title}</h4>
          <strong>{concept.guide}</strong>
        </div>
        <ProductionGuides square />
      </div>
      <DownloadLink file={`indoor-${concept.id}.png`}>{concept.name} PNG</DownloadLink>
    </article>
  );
}

export default function UnniBannerConceptsPage() {
  return (
    <main className={styles.page}>
      <BrandNav />
      <section className={styles.intro}>
        <span>OUTDOOR + INDOOR SIGNAGE</span>
        <h1>길에서는 찾기 쉽고,<br />유리에서는 바로 픽업</h1>
        <p>실외 600×1800mm 양면 입간판 5안과 실내 유리 부착용 600×600mm 픽업존 3안입니다. 양면 모두 브랜드명을 크게 두고, 한 면은 기사 동선, 다른 면은 포장 메뉴 전환에 집중했습니다.</p>
        <div><b>5 OUTDOOR</b><b>10 SIDES</b><b>3 INDOOR</b><b>600×1800 / 600×600</b></div>
      </section>

      <section className={styles.recommend}>
        <span>CTO RECOMMENDATION</span><strong>실외 A · 실내 P2 조합</strong><p>A안은 기사 안내와 메뉴 판매 역할이 가장 명확하고, P2는 유리 너머 원거리 방향 인지가 가장 빠릅니다.</p>
      </section>

      <section className={styles.sectionIntro}>
        <span>01 · OUTDOOR</span><h2>600 × 1800 양면 입간판</h2><p>기존 3안은 1:3 규격과 픽업 동선 중심으로 재설계하고, D·E 두 안을 새로 추가했습니다.</p>
      </section>
      <div className={styles.concepts}>{outdoorConcepts.map((concept) => <OutdoorConceptCard key={concept.id} concept={concept} />)}</div>

      <section className={`${styles.sectionIntro} ${styles.indoorIntro}`}>
        <span>02 · INDOOR GLASS</span><h2>600 × 600 픽업존</h2><p>실내 유리 부착을 전제로 문구를 크게 줄이고, `언니냉면 배달/포장 픽업존`을 모든 안에 동일하게 고정했습니다.</p>
      </section>
      <section className={styles.pickupGrid}>{pickupConcepts.map((concept) => <PickupConceptCard key={concept.id} concept={concept} />)}</section>

      <section className={styles.productionNote}>
        <h2>업체 발주 기준과 제작 상태</h2>
        <div className={styles.specGrid}>
          <div><b>요청 상품 유형</b><span>600×1800 실외 양면 배너 · 세부 사양은 판매자 확인 필요</span></div>
          <div><b>실외 완성 규격</b><span>600 × 1800mm · 양면 10면 구성</span></div>
          <div><b>실내 완성 규격</b><span>600 × 600mm · 유리 부착용 3안</span></div>
          <div><b>가공 유보영역</b><span>실외 상·하단 80mm, 사방 중요정보 30mm 안쪽 배치</span></div>
          <div><b>현재 파일</b><span>RGB PNG 시안 · 화면/내용 확정용</span></div>
          <div><b>발주 전 필수</b><span>판매처 원본 템플릿에서 타공 수·좌표·봉미싱·도련·CMYK 프로파일 최종 확인</span></div>
        </div>
        <p className={styles.warning}>네이버 상세페이지가 로그인·자동접근 차단 상태여서 정확한 구멍 좌표와 접수 파일 형식은 미확정입니다. 현재 점선은 안전한 임시 가이드이며, 판매자에게 받은 AI/PDF 템플릿으로 최종 치환해야 인쇄 사고를 막을 수 있습니다.</p>
      </section>
    </main>
  );
}
