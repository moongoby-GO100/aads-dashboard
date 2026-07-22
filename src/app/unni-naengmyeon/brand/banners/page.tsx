import type { Metadata } from "next";
import Image from "next/image";
import BrandNav from "../BrandNav";
import styles from "./page.module.css";

const ASSET_ROOT = "/brands/unni-naengmyeon/banners-20260722";
const BRAND_LOGO = "/brands/unni-naengmyeon/bowlcut-logo-concepts-20260722/concept-h-wordmark-noodles.png";

type ConceptTone = "classic" | "night" | "nightB1" | "nightD1" | "nightD2" | "ice" | "premium" | "coral";

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
  menuMode: "single" | "set" | "setVisual" | "singleVisualSet";
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

const visualSetMenu = [
  {
    name: "냉면 + 수제돈까스",
    price: "15,500원",
    images: ["nas-donkatsu-set.jpg"],
  },
  {
    name: "냉면 + 찐만두",
    price: "15,000원",
    images: ["nas-mandu-set.jpg"],
  },
  {
    name: "냉면 + 몽땅 SET",
    price: "19,500원",
    images: ["nas-all-in-set.jpg"],
  },
];

const visualSingleMenu = [
  {
    name: "언니냉면",
    tag: "물비냉 속시원",
    detail: "시원한 육수와 비빔 양념을 한 번에",
    price: "10,500원",
    image: "/brands/unni-naengmyeon/menu/nas-water-naengmyeon.jpg",
    alt: "육수와 비빔 양념을 함께 즐기는 언니냉면",
    objectPosition: "50% 50%",
    scale: 1.55,
    transformOrigin: "50% 47%",
  },
  {
    name: "물냉면",
    tag: "과일육수/개운시원",
    detail: "과일육수로 개운하고 시원하게",
    price: "10,000원",
    image: "/brands/unni-naengmyeon/menu/nas-water-naengmyeon.jpg",
    alt: "살얼음 육수를 담은 황동그릇 물냉면",
    objectPosition: "50% 50%",
    scale: 1.55,
    transformOrigin: "50% 47%",
  },
  {
    name: "비빔냉면",
    tag: "매콤달콤",
    detail: "수제 양념의 매콤달콤한 감칠맛",
    price: "10,000원",
    image: "/brands/unni-naengmyeon/menu/nas-bibim-bul-naengmyeon.jpg",
    alt: "매콤한 붉은 양념과 고명을 올린 비빔냉면",
    objectPosition: "50% 50%",
    scale: 1.55,
    transformOrigin: "50% 47%",
  },
  {
    name: "불냉면",
    tag: "매움도전",
    detail: "화끈하게 당기는 매운맛 도전",
    price: "10,000원",
    image: "/brands/unni-naengmyeon/menu/nas-bibim-bul-naengmyeon.jpg",
    alt: "화끈한 붉은 양념과 고명을 올린 불냉면",
    objectPosition: "50% 50%",
    scale: 1.55,
    transformOrigin: "50% 47%",
  },
  {
    name: "처갓집 묵사발",
    tag: "강력추천",
    detail: "도토리묵과 시원한 육수의 별미",
    price: "9,000원",
    image: "/brands/unni-naengmyeon/menu/nas-muksabal.jpg",
    alt: "도토리묵과 오이, 김치, 김가루를 올린 시원한 묵사발",
    objectPosition: "50% 50%",
    scale: 1.55,
    transformOrigin: "50% 47%",
  },
  {
    name: "외할머니 명태회냉면",
    tag: "꼬들꼬들",
    detail: "명태회 130g을 푸짐하게",
    price: "13,000원",
    image: "/brands/unni-naengmyeon/menu/nas-pollack-naengmyeon.jpg",
    alt: "붉은 명태회 양념과 고명을 올린 냉면",
    objectPosition: "50% 50%",
    scale: 1.55,
    transformOrigin: "50% 47%",
  },
];

const b1SetMenu = [
  {
    name: "냉면 + 수제돈까스",
    detail: "혼자서도 든든하게",
    price: "15,500원",
    images: ["nas-donkatsu-set.jpg"],
  },
  {
    name: "냉면 + 찐만두",
    detail: "혼자서도 담백하게",
    price: "15,000원",
    images: ["nas-mandu-set.jpg"],
  },
  {
    name: "냉면 + 미니전",
    detail: "냉면과 쫀득한 미니전",
    price: "13,000원",
    images: ["nas-mini-jeon-set.jpg"],
  },
  {
    name: "냉면 + 함박 4P",
    detail: "냉면과 단짠 함박 4p",
    price: "17,000원",
    images: ["nas-hambak-set.jpg"],
  },
  {
    name: "냉면 + 몽땅 SET",
    detail: "돈까스 + 사이드 2개 선택",
    price: "19,500원",
    images: ["nas-all-in-set.jpg"],
  },
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
    id: "b1",
    tone: "nightB1",
    name: "나이트 라이더 B-1 · 픽업존",
    summary: "B안의 배경과 색감은 그대로 유지하고 상호를 약 2배 확대, 사진형 단품·세트 메뉴와 무방향 픽업존 안내를 결합한 안",
    image: "concept-b-bold-food.png",
    frontTitle: <>언니냉면<br /><em>PICK UP</em></>,
    frontSub: "배달기사 픽업 · 포장 주문",
    direction: "배달·포장 픽업존",
    backTitle: <>시원한 한 끼<br /><em>포장됩니다.</em></>,
    menuMode: "singleVisualSet",
  },
  {
    id: "d1",
    tone: "nightD1",
    name: "나이트 라이더 D-1 · 픽업 비콘",
    summary: "B안의 고대비 야간 톤을 계승하고 상호와 기사 픽업 방향을 최우선으로 키운 안",
    image: "concept-d1-night-water.png",
    frontTitle: <>언니냉면<br /><em>PICK UP</em></>,
    frontSub: "배달기사 픽업 · 방문 포장",
    direction: "입구 방향  →",
    backTitle: <>시원한 냉면에<br /><em>세트까지</em></>,
    menuMode: "setVisual",
  },
  {
    id: "d2",
    tone: "nightD2",
    name: "나이트 라이더 D-2 · 메뉴 스포트라이트",
    summary: "대형 상호와 비빔냉면 비주얼, 사진형 세트 메뉴로 포장 주문 전환을 강화한 안",
    image: "concept-d2-night-set.png",
    frontTitle: <>언니냉면<br /><em>배달·포장</em></>,
    frontSub: "시원한 한 그릇, 바로 픽업",
    direction: "주문·픽업  →",
    backTitle: <>혼자도 둘이도<br /><em>푸짐하게</em></>,
    menuMode: "setVisual",
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
  description: "실외 600×1800mm 양면 입간판 8안과 실내 유리용 600×600mm 픽업존 3안입니다.",
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

function MenuBoard({ mode }: { mode: "single" | "set" | "setVisual" | "singleVisualSet" }) {
  if (mode === "singleVisualSet") {
    return (
      <div className={styles.b1MenuStack}>
        <div className={`${styles.menuBoard} ${styles.b1MenuSection}`}>
          <span>단품메뉴</span>
          <div className={styles.b1MenuRows}>
            {visualSingleMenu.map((item) => (
              <div className={styles.b1MenuRow} key={item.name}>
                <div className={styles.b1SingleThumb}>
                  <Image
                    src={item.image}
                    alt={item.alt}
                    width={240}
                    height={180}
                    style={{
                      objectPosition: item.objectPosition,
                      transform: `scale(${item.scale})`,
                      transformOrigin: item.transformOrigin,
                    }}
                  />
                </div>
                <div className={styles.b1MenuCopy}>
                  <small>[{item.tag}]</small>
                  <b>{item.name}</b>
                  <span>{item.detail}</span>
                </div>
                <strong>{item.price}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.b1SetGroup}>
          <h4>혼자서도 둘이서도<br /><em>푸짐하게</em></h4>
          <div className={`${styles.menuBoard} ${styles.b1MenuSection} ${styles.b1SetSection}`}>
            <span>세트메뉴</span>
            <div className={styles.b1SetRows}>
              {b1SetMenu.map((item) => (
                <div className={styles.b1MenuRow} key={item.name}>
                  <div className={`${styles.b1SetThumb} ${item.images.length > 1 ? styles.menuThumbCollage : ""}`}>
                    {item.images.map((image) => (
                      <Image key={image} src={`/brands/unni-naengmyeon/menu/${image}`} alt="" width={160} height={120} />
                    ))}
                  </div>
                  <div className={styles.b1MenuCopy}>
                    <b>{item.name}</b>
                    <span>{item.detail}</span>
                  </div>
                  <strong>{item.price}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (mode === "setVisual") {
    return (
      <div className={`${styles.menuBoard} ${styles.visualMenuBoard}`}>
        <span>TAKE OUT SET MENU</span>
        {visualSetMenu.map((item) => (
          <div className={styles.visualMenuRow} key={item.name}>
            <div className={`${styles.menuThumb} ${item.images.length > 1 ? styles.menuThumbCollage : ""}`}>
              {item.images.map((image) => (
                <Image
                  key={image}
                  src={`/brands/unni-naengmyeon/menu/${image}`}
                  alt=""
                  width={240}
                  height={160}
                />
              ))}
            </div>
            <div><b>{item.name}</b><strong>{item.price}</strong></div>
          </div>
        ))}
        <small>매장 상황에 따라 메뉴·가격이 변경될 수 있습니다</small>
      </div>
    );
  }
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
  const isNightRider = concept.tone === "night" || concept.tone === "nightB1" || concept.tone === "nightD1" || concept.tone === "nightD2";
  const inverse = isNightRider || concept.tone === "premium";
  const isFeaturedNight = concept.tone === "nightD1" || concept.tone === "nightD2";
  const isB1 = concept.tone === "nightB1";
  const pickupLabel = isB1 ? "배달·포장 픽업존" : "입구 방향  →";
  return (
    <article className={styles.concept}>
      <div className={styles.conceptHeading}>
        <div><span>CONCEPT {concept.id.toUpperCase()}</span><h2>{concept.name}</h2></div>
        <p>{concept.summary}</p>
      </div>
      <div className={styles.pair}>
        <div>
          <div className={`${styles.banner} ${styles[concept.tone]} ${isFeaturedNight ? styles.featuredNight : ""} ${isB1 ? styles.b1Feature : ""} ${styles.front}`} data-export={`outdoor-${concept.id}-front`}>
            <Image className={styles.coverImage} src={`${ASSET_ROOT}/${concept.image}`} alt="" fill sizes="600px" priority={concept.id === "a"} />
            <div className={styles.frontShade} />
            <div className={styles.bannerInner}>
              <div className={isFeaturedNight ? styles.prominentLogo : ""}><BannerLogo inverse={inverse} /></div>
              <div className={styles.frontCopy}>
                <span>DELIVERY · TAKE OUT</span>
                <h3>{concept.frontTitle}</h3>
                <p>{concept.frontSub}</p>
              </div>
              <div className={styles.direction}>{concept.direction}</div>
              {isB1 ? <div className={styles.frontFooterLogo}><BannerLogo inverse /></div> : <div className={styles.location}>서울 성북구 동소문로 90 1층</div>}
            </div>
            {!isB1 && <ProductionGuides />}
          </div>
          <DownloadLink file={`outdoor-${concept.id}-front.png`}>{concept.id.toUpperCase()} 앞면 PNG</DownloadLink>
        </div>
        <div>
          <div className={`${styles.banner} ${styles[concept.tone]} ${isFeaturedNight ? styles.featuredNight : ""} ${isB1 ? styles.b1Feature : ""} ${styles.back}`} data-export={`outdoor-${concept.id}-back`}>
            <Image className={styles.backImage} src={`${ASSET_ROOT}/${concept.image}`} alt="" fill sizes="600px" />
            <div className={styles.backShade} />
            <div className={styles.bannerInner}>
              <div className={isFeaturedNight ? styles.prominentLogo : ""}><BannerLogo inverse={inverse} /></div>
              <div className={styles.backCopy}><span>UNNI&apos;S CHOICE</span><h3>{concept.backTitle}</h3></div>
              <MenuBoard mode={concept.menuMode} />
              {isB1 ? (
                <div className={styles.b1BackFooter}>
                  <BannerLogo inverse />
                  <strong>배달·포장 픽업존</strong>
                </div>
              ) : (
                <div className={styles.backPickup}><b>배달기사 픽업 · 방문 포장</b><strong>{pickupLabel}</strong></div>
              )}
            </div>
            {!isB1 && <ProductionGuides />}
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
        <p>실외 600×1800mm 양면 입간판 8안과 실내 유리 부착용 600×600mm 픽업존 3안입니다. B-1은 B안의 나이트 라이더 배경을 그대로 유지하면서 상호 확대, 사진형 단품·세트 메뉴, 방향 없는 픽업존 안내를 반영했습니다.</p>
        <div><b>8 OUTDOOR</b><b>16 SIDES</b><b>3 INDOOR</b><b>600×1800 / 600×600</b></div>
      </section>

      <section className={styles.recommend}>
        <span>CTO RECOMMENDATION</span><strong>실외 B-1 · 실내 P2 조합</strong><p>B-1은 검토 완료된 B 배경을 유지하면서 상호 가독성, 기사 픽업 인지, 단품·세트 메뉴 선택을 한 번에 해결합니다.</p>
      </section>

      <section className={styles.sectionIntro}>
        <span>01 · OUTDOOR</span><h2>600 × 1800 양면 입간판</h2><p>B-1은 CONCEPT B의 이미지와 나이트 라이더 톤을 그대로 사용하고 요청하신 정보 계층만 수정했습니다. 웹과 PNG 모두 같은 Pretendard 원본 폰트를 사용합니다.</p>
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
          <div><b>실외 완성 규격</b><span>600 × 1800mm · 양면 16면 구성</span></div>
          <div><b>실내 완성 규격</b><span>600 × 600mm · 유리 부착용 3안</span></div>
          <div><b>가공 유보영역</b><span>실외 상·하단 80mm, 사방 중요정보 30mm 안쪽 배치</span></div>
          <div><b>현재 파일</b><span>RGB PNG 시안 · 웹/PNG 동일 Pretendard 폰트 고정</span></div>
          <div><b>발주 전 필수</b><span>판매처 원본 템플릿에서 타공 수·좌표·봉미싱·도련·CMYK 프로파일 최종 확인</span></div>
        </div>
        <p className={styles.warning}>네이버 상세페이지가 로그인·자동접근 차단 상태여서 정확한 구멍 좌표와 접수 파일 형식은 미확정입니다. 현재 점선은 안전한 임시 가이드이며, 판매자에게 받은 AI/PDF 템플릿으로 최종 치환해야 인쇄 사고를 막을 수 있습니다.</p>
      </section>
    </main>
  );
}
