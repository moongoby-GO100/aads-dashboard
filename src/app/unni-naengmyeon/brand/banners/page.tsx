import type { Metadata } from "next";
import Image from "next/image";
import BrandNav from "../BrandNav";
import styles from "./page.module.css";

const ASSET_ROOT = "/brands/unni-naengmyeon/banners-20260722";
const BRAND_LOGO = "/brands/unni-naengmyeon/bowlcut-logo-concepts-20260722/concept-h-wordmark-noodles.png";

type ConceptTone = "classic" | "night" | "nightB1" | "nightB2" | "nightD1" | "nightD2" | "ice" | "premium" | "coral";

type OutdoorConcept = {
  id: string;
  tone: ConceptTone;
  name: string;
  summary: string;
  image: string;
  imageSrc?: string;
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
    id: "b2",
    tone: "nightB2",
    name: "나이트 라이더 B-2 · 냉면 포토 픽업존",
    summary: "B-1의 딥그린·화이트·코랄 픽업존을 유지하고, 실제 물냉면 사진을 전면 중앙에 크게 보여 식욕과 브랜드 인지를 함께 높인 사진형 신규안",
    image: "concept-b-bold-food.png",
    imageSrc: "/brands/unni-naengmyeon/hero-naengmyeon-brass-v2.webp",
    frontTitle: <>언니냉면<br /><em>시원한 한 그릇</em></>,
    frontSub: "배달기사 픽업 · 포장 주문",
    direction: "배달·포장 픽업존",
    backTitle: <>시원한 냉면<br /><em>바로 포장됩니다.</em></>,
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
  {
    id: "p4",
    name: "나이트 라이더 B-1",
    summary: "실외 B-1의 딥그린·화이트·코랄 고대비를 실내 픽업존에 맞춘 신규 추천안",
    image: `${ASSET_ROOT}/concept-b-bold-food.png`,
    tone: "pickupB1",
    eyebrow: "DELIVERY · TAKE OUT",
    title: <>언니냉면<em>배달·포장 픽업존</em></>,
    guide: "주문번호 확인 후 픽업",
  },
  {
    id: "p5",
    name: "나이트 라이더 B-1 · 글라스 픽업",
    summary: "B-1의 딥그린·코랄 대비를 유지하고, 유리 부착과 4개 타공을 고려해 핵심 안내를 중앙 안전영역에 집중한 인쇄용 신규안",
    image: "/brands/unni-naengmyeon/hero-naengmyeon-brass-v2.webp",
    tone: "pickupB1Print",
    eyebrow: "DELIVERY · TAKE OUT",
    title: <>언니냉면<em>배달·포장 픽업존</em></>,
    guide: "주문번호 확인 후 픽업",
  },
  {
    id: "p6",
    name: "나이트 라이더 B-2 · 냉면 스포트라이트",
    summary: "P5의 타공 안전영역은 유지하면서 실제 물냉면을 하단에 크게 드러낸 사진형 수정안. 유리 너머에서도 메뉴와 픽업 목적을 즉시 인지하도록 구성했습니다.",
    image: "/brands/unni-naengmyeon/hero-naengmyeon-brass-v2.webp",
    tone: "pickupB2Food",
    eyebrow: "DELIVERY · TAKE OUT",
    title: <>언니냉면<em>배달·포장 픽업존</em></>,
    guide: "주문번호 확인 후 픽업",
  },
  {
    id: "p7",
    name: "나이트 라이더 B-3 · 볼드 픽업",
    summary: "상호·픽업 안내를 가장 먼저 읽히게 하고, 오른쪽 물냉면 사진을 보조 비주얼로 둔 간결한 고대비안. 배달기사 동선 안내에 집중한 추가안입니다.",
    image: "/brands/unni-naengmyeon/hero-naengmyeon-brass-v2.webp",
    tone: "pickupB3Bold",
    eyebrow: "DELIVERY · TAKE OUT",
    title: <>언니냉면<em>배달·포장 픽업존</em></>,
    guide: "주문번호 확인 후 픽업",
  },
];

export const metadata: Metadata = {
  title: "언니냉면 600×1800 양면 입간판 · 픽업존 시안",
  description: "실외 600×1800mm 양면 입간판 8안과 실내 유리용 600×600mm 픽업존 4안입니다.",
};

function BannerLogo({ inverse = false, showSymbol = true }: { inverse?: boolean; showSymbol?: boolean }) {
  return (
    <div className={`${styles.bannerLogo} ${inverse ? styles.inverseLogo : ""}`}>
      {showSymbol && <Image src={BRAND_LOGO} alt="언니냉면 컨셉 H 로고" width={1254} height={1254} />}
      <strong>언니냉면</strong>
    </div>
  );
}

function DownloadLink({ file, children, print = false }: { file: string; children: React.ReactNode; print?: boolean }) {
  if (print) {
    return <a className={styles.download} href={`${ASSET_ROOT}/print/300dpi/${file}`} download>{children}</a>;
  }
  return <a className={styles.download} href={`${ASSET_ROOT}/print/${file}`} download>{children}</a>;
}

function ProductionGuides({ square = false, holes = false }: { square?: boolean; holes?: boolean }) {
  return (
    <div className={`${styles.guides} ${square ? styles.squareGuides : ""} ${holes ? styles.holeGuides : ""}`} aria-hidden="true">
      {holes && <><i className={styles.holeTopLeft} /><i className={styles.holeTopRight} /><i className={styles.holeBottomLeft} /><i className={styles.holeBottomRight} /></>}
      <span className={styles.safeLabel}>{holes ? "타공 가이드: Ø10mm · 중심 25mm / 중요정보 사방 35mm 안쪽" : square ? "사방 30mm 안전영역" : "상·하 80mm 가공 유보 / 사방 30mm 안전영역"}</span>
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
  const isNightRider = concept.tone === "night" || concept.tone === "nightB1" || concept.tone === "nightB2" || concept.tone === "nightD1" || concept.tone === "nightD2";
  const inverse = isNightRider || concept.tone === "premium";
  const isFeaturedNight = concept.tone === "nightD1" || concept.tone === "nightD2";
  const isB1 = concept.tone === "nightB1";
  const isB2 = concept.tone === "nightB2";
  const isBSeries = isB1 || isB2;
  const imageSrc = concept.imageSrc ?? `${ASSET_ROOT}/${concept.image}`;
  const pickupLabel = isBSeries ? "배달·포장 픽업존" : "입구 방향  →";
  return (
    <article className={styles.concept}>
      <div className={styles.conceptHeading}>
        <div><span>CONCEPT {concept.id.toUpperCase()}</span><h2>{concept.name}</h2></div>
        <p>{concept.summary}</p>
      </div>
      <div className={styles.pair}>
        <div>
          <div className={`${styles.banner} ${styles[concept.tone]} ${isFeaturedNight ? styles.featuredNight : ""} ${isB1 ? styles.b1Feature : ""} ${isB2 ? styles.b2Feature : ""} ${styles.front}`} data-export={`outdoor-${concept.id}-front`}>
            <Image className={styles.coverImage} src={imageSrc} alt="" fill sizes="600px" priority={concept.id === "a" || isB2} />
            <div className={styles.frontShade} />
            {isB2 && <div className={styles.b2PhotoSpotlight}><Image src={imageSrc} alt="살얼음 육수와 고명을 올린 물냉면" fill sizes="520px" /></div>}
            <div className={styles.bannerInner}>
              <div className={isFeaturedNight ? styles.prominentLogo : ""}><BannerLogo inverse={inverse} /></div>
              <div className={styles.frontCopy}>
                <span>DELIVERY · TAKE OUT</span>
                <h3>{concept.frontTitle}</h3>
                <p>{concept.frontSub}</p>
              </div>
              <div className={styles.direction}>{concept.direction}</div>
              {isBSeries ? <div className={styles.frontFooterLogo}><BannerLogo inverse /></div> : <div className={styles.location}>서울 성북구 동소문로 90 1층</div>}
            </div>
            {!isBSeries && <ProductionGuides />}
          </div>
          <DownloadLink file={`outdoor-${concept.id}-front.png`}>{concept.id.toUpperCase()} 앞면 PNG</DownloadLink>
          {isBSeries && <><br /><a className={styles.download} href={`/brands/unni-naengmyeon/banners-20260722/print/300dpi/outdoor-${concept.id}-front.png`} download>300DPI 인쇄용 다운로드</a></>}
        </div>
        <div>
          <div className={`${styles.banner} ${styles[concept.tone]} ${isFeaturedNight ? styles.featuredNight : ""} ${isB1 ? styles.b1Feature : ""} ${isB2 ? styles.b2Feature : ""} ${styles.back}`} data-export={`outdoor-${concept.id}-back`}>
            <Image className={styles.backImage} src={imageSrc} alt="" fill sizes="600px" />
            <div className={styles.backShade} />
            <div className={styles.bannerInner}>
              <div className={isFeaturedNight ? styles.prominentLogo : ""}><BannerLogo inverse={inverse} /></div>
              <div className={styles.backCopy}><span>UNNI&apos;S CHOICE</span><h3>{concept.backTitle}</h3></div>
              <MenuBoard mode={concept.menuMode} />
              {isBSeries ? (
                <div className={styles.b1BackFooter}>
                  <BannerLogo inverse />
                  <strong>배달·포장 픽업존</strong>
                </div>
              ) : (
                <div className={styles.backPickup}><b>배달기사 픽업 · 방문 포장</b><strong>{pickupLabel}</strong></div>
              )}
            </div>
            {!isBSeries && <ProductionGuides />}
          </div>
          <DownloadLink file={`outdoor-${concept.id}-back.png`}>{concept.id.toUpperCase()} 뒷면 PNG</DownloadLink>
          {isBSeries && <><br /><a className={styles.download} href={`/brands/unni-naengmyeon/banners-20260722/print/300dpi/outdoor-${concept.id}-back.png`} download>300DPI 인쇄용 다운로드</a></>}
        </div>
      </div>
    </article>
  );
}

function PickupConceptCard({ concept }: { concept: typeof pickupConcepts[number] }) {
  const isB1 = concept.id === "p4";
  const isPrintB1 = concept.id === "p5";
  const isPrintFood = concept.id === "p6" || concept.id === "p7";
  return (
    <article className={styles.pickupConcept}>
      <div><span>INDOOR {concept.id.toUpperCase()}</span><h3>{concept.name}</h3><p>{concept.summary}</p></div>
      <div className={`${styles.pickupBanner} ${styles[concept.tone]}`} data-export={`indoor-${concept.id}`}>
        <Image
          className={styles.pickupImage}
          src={concept.image.startsWith("/") ? concept.image : `${ASSET_ROOT}/pickup/${concept.image}`}
          alt=""
          fill
          sizes="600px"
        />
        <div className={styles.pickupShade} />
        {isPrintB1 && <div className={styles.p5TopArtifactMask} aria-hidden="true" />}
        <div className={styles.pickupInner}>
          <BannerLogo inverse={concept.id === "p2" || isB1 || isPrintB1 || isPrintFood} showSymbol={!isPrintB1} />
          <span>{concept.eyebrow}</span>
          <h4>{concept.title}</h4>
          <strong>{concept.guide}</strong>
        </div>
        {!isB1 && !isPrintB1 && !isPrintFood && <ProductionGuides square />}
        {(isPrintB1 || isPrintFood) && <ProductionGuides square holes />}
      </div>
      <DownloadLink file={`indoor-${concept.id}.png`}>{concept.name} PNG</DownloadLink>
      {(isPrintB1 || isPrintFood) && <>
        <DownloadLink file={`indoor-${concept.id}-glass-pickup-300dpi.png`} print>300DPI 인쇄용 다운로드</DownloadLink>
        <DownloadLink file={`indoor-${concept.id}-glass-pickup-hole-guide-300dpi.png`} print>타공 위치 가이드 다운로드</DownloadLink>
      </>}
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
        <p>실외 600×1800mm 양면 입간판 9안과 실내 유리 부착용 600×600mm 픽업존 7안입니다. B-1은 메뉴 정보를, B-2는 실제 냉면 사진을 전면에 크게 보여 주도록 구성했고 모두 나이트 라이더 픽업존 톤을 유지합니다.</p>
        <div><b>9 OUTDOOR</b><b>18 SIDES</b><b>7 INDOOR</b><b>600×1800 / 600×600</b></div>
      </section>

      <section className={styles.recommend}>
        <span>CTO RECOMMENDATION</span><strong>실외 B-1 · 실내 P4 조합</strong><p>실외·실내 모두 같은 나이트 라이더 톤을 사용해 상호와 픽업존을 일관되게 인지시킵니다.</p>
      </section>

      <section className={styles.sectionIntro}>
        <span>01 · OUTDOOR</span><h2>600 × 1800 양면 입간판</h2><p>B-1은 메뉴 정보를, B-2는 실제 냉면 사진을 전면 중앙에 크게 보여 줍니다. 두 안 모두 CONCEPT B의 나이트 라이더 톤과 Pretendard 원본 폰트를 유지합니다.</p>
      </section>
      <div className={styles.concepts}>{outdoorConcepts.map((concept) => <OutdoorConceptCard key={concept.id} concept={concept} />)}</div>

      <section className={`${styles.sectionIntro} ${styles.indoorIntro}`}>
        <span>02 · INDOOR GLASS</span><h2>600 × 600 픽업존</h2><p>실내 유리 부착을 전제로 문구를 크게 줄이고, `언니냉면 배달/포장 픽업존`을 모든 안에 동일하게 고정했습니다. P5는 타공 안전형, P6는 실제 냉면 사진을 크게 살린 사진형, P7은 상호·픽업 목적을 먼저 읽히게 한 고대비형 인쇄용 안입니다.</p>
      </section>
      <section className={styles.pickupGrid}>{pickupConcepts.map((concept) => <PickupConceptCard key={concept.id} concept={concept} />)}</section>

      <section className={styles.productionNote}>
        <h2>업체 발주 기준과 제작 상태</h2>
        <div className={styles.specGrid}>
          <div><b>요청 상품 유형</b><span>600×1800 실외 양면 배너 · 세부 사양은 판매자 확인 필요</span></div>
          <div><b>실외 완성 규격</b><span>600 × 1800mm · 양면 16면 구성</span></div>
          <div><b>실내 완성 규격</b><span>600 × 600mm · 유리 부착용 7안</span></div>
          <div><b>가공 유보영역</b><span>실외 상·하단 80mm, 사방 중요정보 30mm 안쪽 배치</span></div>
          <div><b>P5·P6·P7 인쇄 원본</b><span>각 7,087 × 7,087px · 300DPI · RGB PNG · Pretendard 폰트 고정</span></div>
          <div><b>임시 타공 기준</b><span>4곳 Ø10mm · 각 모서리 중심선에서 25mm · 중요 정보 사방 35mm 안쪽</span></div>
          <div><b>발주 전 필수</b><span>판매처 원본 템플릿에서 타공 수·좌표·봉미싱·도련·CMYK 프로파일 최종 확인</span></div>
        </div>
        <p className={styles.warning}>P5·P6·P7의 타공 좌표는 판매처 템플릿 미확보 상태에서 적용한 임시 기준입니다. 인쇄용 PNG는 가이드선을 제외한 최종 아트워크이며, 별도 타공 가이드 PNG를 함께 내려받아 업체 템플릿과 대조해 주세요. 업체가 다른 타공 규격을 요구하면 가이드 기준에 맞춰 재출력해야 합니다.</p>
      </section>
    </main>
  );
}
