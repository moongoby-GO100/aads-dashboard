import type { Metadata, Viewport } from "next";
import Image from "next/image";
import InquiryForm from "./InquiryForm";
import styles from "./page.module.css";

const BRAND_LOGO = "/brands/unni-naengmyeon/bowlcut-logo-concepts-20260722/concept-h-wordmark-noodles.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://aads.newtalk.kr"),
  title: "언니냉면 | 성신여대 배달 냉면",
  applicationName: "언니냉면",
  description: "성신여대 앞 배달전문 냉면 브랜드, 언니냉면입니다. 황동그릇에 담은 물냉면과 매콤한 비빔냉면 메뉴를 만나보세요.",
  keywords: ["언니냉면", "성신여대 냉면", "성북구 냉면", "배달 냉면", "물냉면", "비빔냉면"],
  openGraph: {
    title: "언니냉면 | 언니가 제대로 말아주는 냉면",
    description: "성신여대 앞에서 시작하는 배달전문 냉면 브랜드",
    type: "website",
    locale: "ko_KR",
    images: [{ url: BRAND_LOGO, width: 1254, height: 1254, alt: "바가지머리와 냉면 그릇 사이에 언니냉면 글씨와 면발을 결합한 컨셉 H 로고" }],
  },
  icons: {
    icon: [{ url: BRAND_LOGO, type: "image/png" }],
    apple: [{ url: BRAND_LOGO }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "언니냉면" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f45d48",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const PinIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.1 7-12A7 7 0 1 0 5 9c0 5.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/></svg>
);

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg>
);

type MenuItem = {
  name: string;
  detail?: string;
  price: string;
  badge?: string;
  toppings?: boolean;
};

const TOPPING_DESCRIPTION = "땅콩 + 깨 + 무김치 + 오이 + 계란 (다대기가 소량 들어가는 메뉴에요 :))";
const MENU_ASSET_ROOT = "/brands/unni-naengmyeon/menu";
const WATER_MENU_IMAGE = `${MENU_ASSET_ROOT}/nas-water-naengmyeon.jpg`;

function getMenuImage(name: string) {
  // NAS 원본 파일명이 특정하는 메뉴에만 사진을 붙인다. 구성과 다른
  // 유사 사진을 키워드로 재사용하지 않아 실제 판매 메뉴를 오인하지 않게 한다.
  if (name === "외할머니 명태회냉면") return `${MENU_ASSET_ROOT}/nas-pollack-naengmyeon.jpg`;
  if (name === "물비냉 언니냉면" || name === "물냉면") return WATER_MENU_IMAGE;
  if (name === "비빔냉면" || name === "불냉면") return `${MENU_ASSET_ROOT}/nas-bibim-bul-naengmyeon.jpg`;
  if (name === "처갓집 묵사발") return `${MENU_ASSET_ROOT}/nas-muksabal.jpg`;
  if (name === "냉면 + 수제돈까스 SET") return `${MENU_ASSET_ROOT}/nas-donkatsu-set.jpg`;
  if (name === "냉면 + 찐만두 SET") return `${MENU_ASSET_ROOT}/nas-mandu-set.jpg`;
  if (name === "냉면 + 미니전 SET") return `${MENU_ASSET_ROOT}/nas-mini-jeon-set.jpg`;
  if (name === "냉면 + 함박 4P SET") return `${MENU_ASSET_ROOT}/nas-hambak-set.jpg`;
  if (name === "냉면 + 몽땅 SET") return `${MENU_ASSET_ROOT}/nas-all-in-set.jpg`;
  return null;
}

const signatureMenus: MenuItem[] = [
  { name: "외할머니 명태회냉면", detail: "꼬들꼬들한 명태회 130g을 푸짐하게", price: "13,000원", badge: "꼬들꼬들 명태회", toppings: true },
  { name: "물비냉 언니냉면", detail: "시원한 육수와 비빔 양념을 함께 즐기는 대표 메뉴", price: "10,500원", badge: "인기 메뉴", toppings: true },
  { name: "물냉면", detail: "과일 육수로 개운하고 시원하게", price: "10,000원", toppings: true },
  { name: "비빔냉면", detail: "매콤달콤한 수제 양념", price: "10,000원", toppings: true },
  { name: "불냉면", detail: "매운맛에 도전하는 화끈한 한 그릇", price: "10,000원", toppings: true },
  { name: "처갓집 묵사발", detail: "도토리묵·오이·김치·김가루", price: "9,000원", badge: "술안주 추천" },
];

const soloSets: MenuItem[] = [
  { name: "냉면 + 만두튀김 SET", detail: "냉면 + 만두튀김 2p", price: "14,500원", badge: "시원·바삭", toppings: true },
  { name: "냉면 + 함박 2P SET", detail: "냉면 + 함박스테이크 2p", price: "14,000원", badge: "시원·단짠", toppings: true },
  { name: "냉면 + 미니전 SET", detail: "냉면 + 미니전 3p", price: "13,000원", badge: "시원·쫀득", toppings: true },
  { name: "냉면 + 수제돈까스 SET", detail: "냉면 + 수제 등심돈까스 1p", price: "15,500원", badge: "찰떡궁합", toppings: true },
  { name: "냉면 + 찐만두 SET", detail: "냉면 + 찐만두 4p", price: "15,000원", badge: "담백궁합", toppings: true },
  { name: "냉면 + 만두튀김 SET", detail: "냉면 + 만두튀김 4p", price: "16,000원", badge: "바삭궁합", toppings: true },
  { name: "냉면 + 함박 4P SET", detail: "냉면 + 함박스테이크 4p", price: "17,000원", badge: "달달궁합", toppings: true },
  { name: "냉면 + 미니전 SET", detail: "냉면 + 미니전 6p", price: "15,500원", badge: "쫀득궁합", toppings: true },
  { name: "냉면 + 몽땅 SET", detail: "냉면 + 수제돈까스 1p + 사이드 2개 선택", price: "19,500원", badge: "열정가득", toppings: true },
];

const doubleSets: MenuItem[] = [
  { name: "냉면 + 냉면 + 수제돈까스 SET", detail: "냉면 2그릇 + 수제돈까스 1p", price: "25,000원", badge: "참 든든한정식", toppings: true },
  { name: "냉면 + 냉면 + 찐만두 SET", detail: "냉면 2그릇 + 찐만두 4p", price: "25,500원", badge: "담백정식", toppings: true },
  { name: "냉면 + 냉면 + 만두튀김 SET", detail: "냉면 2그릇 + 만두튀김 4p", price: "26,000원", badge: "바삭정식", toppings: true },
  { name: "냉면 + 냉면 + 함박 4P SET", detail: "냉면 2그릇 + 함박스테이크 4p", price: "26,500원", badge: "열정정식", toppings: true },
  { name: "냉면 + 냉면 + 미니전 SET", detail: "냉면 2그릇 + 미니전 6p", price: "25,000원", badge: "쫀득정식", toppings: true },
];

const sideMenus: MenuItem[] = [
  { name: "수제 등심돈까스", price: "5,500원" },
  { name: "새우튀김 4p", price: "5,000원" },
  { name: "함박스테이크", detail: "2p 4,000원 · 4p 8,000원", price: "4,000원부터" },
  { name: "고기찐만두 4p", price: "6,000원" },
  { name: "김치찐만두 4p", price: "6,000원" },
  { name: "반반찐만두 4p", price: "6,000원" },
  { name: "갈비찐만두 5p", price: "5,000원" },
  { name: "고기만두튀김 4p", price: "6,500원" },
  { name: "반반만두튀김 4p", price: "6,500원" },
  { name: "갈비만두튀김 5p", price: "5,500원" },
  { name: "미니 감자전 4p", price: "3,500원" },
  { name: "미니 김치전 4p", price: "3,500원" },
  { name: "미니 부추전 4p", price: "3,500원" },
  { name: "미니 모듬전 6p", price: "6,000원" },
];

const extras: MenuItem[] = [
  { name: "살얼음 동동 육수 추가", price: "2,000원" },
  { name: "수제양념 다대기 추가", price: "1,000원" },
  { name: "매운 수제양념 다대기 추가", price: "1,000원" },
  { name: "명태회 130g 추가", price: "3,000원" },
  { name: "무김치 추가", price: "1,000원" },
  { name: "계란 추가", price: "1,000원" },
  { name: "돈까스소스 추가", price: "1,000원" },
];

const drinks: MenuItem[] = [
  { name: "코카콜라 355ml", price: "2,000원" },
  { name: "코카콜라 제로 355ml", price: "2,000원" },
  { name: "펩시 제로 355ml", price: "2,000원" },
  { name: "칠성사이다 355ml", price: "2,000원" },
  { name: "식혜 238ml", price: "1,000원" },
];

function MenuList({ items }: { items: MenuItem[] }) {
  return (
    <div className={styles.fullMenuGrid}>
      {items.map((item, index) => {
        const menuImage = getMenuImage(item.name);
        return (
          <article className={styles.fullMenuItem} key={`${item.name}-${index}`}>
            {menuImage && (
              <div className={styles.menuThumb}>
                <Image
                  className={styles.nasMenuCrop}
                  src={menuImage}
                  alt={`${item.name} 메뉴 이미지`}
                  fill
                  sizes="96px"
                />
              </div>
            )}
            <div className={styles.menuItemCopy}>
              {item.badge && <span>{item.badge}</span>}
              <h4>{item.name}</h4>
              {item.detail && <p>{item.detail}</p>}
              {item.toppings && <p className={styles.toppingDescription}>{TOPPING_DESCRIPTION}</p>}
            </div>
            <strong>{item.price}</strong>
          </article>
        );
      })}
    </div>
  );
}

export default function UnniNaengmyeonPage() {
  return (
    <main className={styles.site}>
      <a className={styles.skipLink} href="#main-content">본문으로 바로가기</a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="#top" aria-label="언니냉면 홈">
            <Image src={BRAND_LOGO} alt="언니냉면 컨셉 H 로고" width={1254} height={1254} priority />
            <span className={styles.brandWordmark} aria-hidden="true">언니냉면</span>
          </a>
          <nav className={styles.nav} aria-label="주요 메뉴">
            <a href="#menu">메뉴</a>
            <div className={styles.navGroup}>
              <button type="button" aria-haspopup="true">브랜드 <span aria-hidden="true">⌄</span></button>
              <div className={styles.navDropdown}>
                <a href="#story">브랜드 스토리</a>
                <a href="/unni-naengmyeon/brand/logo">로고 가이드</a>
                <a href="/unni-naengmyeon/brand/banners">입간판 시안</a>
              </div>
            </div>
            <a href="#location">매장 안내</a>
            <a href="#inquiry">문의</a>
          </nav>
          <span className={styles.headerCta} aria-disabled="true">배민 입점 준비 중</span>
        </div>
      </header>

      <section className={styles.hero} id="top">
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroInner} id="main-content">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>SUNGSHIN WOMEN&apos;S UNIV. · DELIVERY ONLY</span>
            <h1>언니가 제대로<br /><em>말아주는 냉면</em></h1>
            <p>시원하게 당기는 날도, 매콤하게 풀고 싶은 날도.<br className={styles.desktopBreak} /> 성신여대 앞 언니냉면이 곧 찾아갑니다.</p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href="#menu">메뉴 미리보기 <ArrowIcon /></a>
              <a className={styles.textButton} href="#location"><PinIcon /> 성신여대점 위치</a>
            </div>
            <div className={styles.openingNote}>
              <span className={styles.pulse} aria-hidden="true" />
              언니냉면 메뉴 준비 중
            </div>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.heroBadge}><b>ICE COLD</b><span>끝까지 시원하게</span></div>
            <Image
              className={styles.nasMenuCrop}
              src={WATER_MENU_IMAGE}
              alt="황동그릇에 땅콩, 깨, 무김치, 오이, 계란과 붉은 다대기를 담은 물냉면"
              fill
              priority
              sizes="(max-width: 900px) 100vw, 55vw"
            />
            <span className={styles.imageDisclaimer}>실제 메뉴 이미지</span>
          </div>
        </div>
        <div className={styles.marquee} aria-label="언니냉면 브랜드 키워드">
          <div><span>살얼음 육수</span><i>◆</i><span>수제 다대기</span><i>◆</i><span>푸짐한 고명</span><i>◆</i><span>시원하게</span><i>◆</i><span>매콤하게</span><i>◆</i><span>든든하게</span><i>◆</i><span>언니답게</span><i>◆</i><span>배달 한 그릇</span><i>◆</i><span>살얼음 육수</span><i>◆</i><span>수제 다대기</span><i>◆</i><span>푸짐한 고명</span></div>
        </div>
      </section>

      <section className={styles.menuSection} id="menu">
        <div className={styles.sectionHeading}>
          <span>OUR MENU</span>
          <h2>익숙한 메뉴 그대로,<br />이제 언니냉면으로</h2>
          <p>전달해 주신 배민 메뉴를 기준으로 이름과 구성을 언니냉면에 맞춰 반영했습니다.</p>
        </div>
        <div className={styles.menuGallery}>
          <div className={`${styles.galleryPhoto} ${styles.galleryLead}`}>
            <Image
              className={styles.nasMenuCrop}
              src={WATER_MENU_IMAGE}
              alt="붉은 다대기와 고명이 보이는 언니 물냉면"
              fill
              sizes="(max-width: 900px) 100vw, 50vw"
            />
            <span>언니 물냉면</span>
          </div>
          <div className={styles.galleryStack}>
            <div className={styles.galleryPhoto}>
              <Image className={styles.nasMenuCrop} src={`${MENU_ASSET_ROOT}/nas-bibim-bul-naengmyeon.jpg`} alt="언니 비빔냉면" fill sizes="(max-width: 900px) 50vw, 25vw" />
              <span>언니 비빔냉면</span>
            </div>
            <div className={styles.galleryPhoto}>
              <Image className={styles.nasMenuCrop} src={`${MENU_ASSET_ROOT}/nas-donkatsu-set.jpg`} alt="언니냉면과 수제돈까스 세트" fill sizes="(max-width: 900px) 50vw, 25vw" />
              <span>냉면 + 수제돈까스</span>
            </div>
          </div>
          <div className={styles.galleryPhoto}>
            <Image className={styles.nasMenuCrop} src={`${MENU_ASSET_ROOT}/nas-mandu-set.jpg`} alt="언니냉면과 찐만두 세트" fill sizes="(max-width: 900px) 100vw, 50vw" />
            <span>냉면 + 찐만두</span>
          </div>
        </div>

        <div className={styles.fullMenu}>
          <section className={styles.menuCategory}>
            <div className={styles.menuCategoryHeading}><span>01</span><div><small>MAIN</small><h3>대표 냉면</h3></div></div>
            <MenuList items={signatureMenus} />
          </section>
          <section className={styles.menuCategory}>
            <div className={styles.menuCategoryHeading}><span>02</span><div><small>SOLO SET</small><h3>혼자서도 든든한 세트</h3></div></div>
            <MenuList items={soloSets} />
          </section>
          <section className={styles.menuCategory}>
            <div className={styles.menuCategoryHeading}><span>03</span><div><small>DOUBLE SET</small><h3>둘이서 든든한 세트</h3></div></div>
            <MenuList items={doubleSets} />
          </section>
          <section className={styles.menuCategory}>
            <div className={styles.menuCategoryHeading}><span>04</span><div><small>SIDE</small><h3>사이드 메뉴</h3></div></div>
            <MenuList items={sideMenus} />
          </section>
          <section className={styles.menuCategory}>
            <div className={styles.menuCategoryHeading}><span>05</span><div><small>EXTRA &amp; DRINK</small><h3>추가 메뉴 · 음료</h3></div></div>
            <MenuList items={[...extras, ...drinks]} />
          </section>
        </div>
        <p className={styles.menuNotice}>가격은 전달된 배민 메뉴 화면 기준입니다. 사진은 원본 메뉴와 구성이 일치하는 항목에만 표시하며, 할인·선택 옵션·판매 여부는 실제 주문 화면에서 달라질 수 있습니다.</p>
      </section>

      <section className={styles.storySection} id="story">
        <div className={styles.storyCard}>
          <div className={styles.storyMark} aria-hidden="true">언</div>
          <div className={styles.storyCopy}>
            <span>WHY UNNI?</span>
            <h2>가깝고, 편하고,<br />자꾸 생각나는 한 그릇</h2>
            <p>언니냉면은 시원한 육수와 매콤한 양념, 푸짐한 고명을 한 그릇에 담아 전하는 성신여대 앞 배달전문 냉면 브랜드입니다. 복잡한 말보다 맛있는 한 그릇으로 기억되겠습니다.</p>
          </div>
          <ul className={styles.promiseList}>
            <li><b>01</b><span><strong>배달전문</strong>주문부터 식사까지 편하게</span></li>
            <li><b>02</b><span><strong>두 가지 취향</strong>시원한 물냉면, 매콤한 비빔냉면</span></li>
            <li><b>03</b><span><strong>성신여대 앞</strong>가까운 동네에서 빠르게</span></li>
          </ul>
        </div>
      </section>

      <section className={styles.locationSection} id="location">
        <div className={styles.locationInner}>
          <div>
            <span className={styles.darkEyebrow}>LOCATION</span>
            <h2>언니냉면<br />성신여대점</h2>
          </div>
          <div className={styles.locationDetails}>
            <div className={styles.addressIcon}><PinIcon /></div>
            <div>
              <strong>서울특별시 성북구 동소문로 90 1층</strong>
              <p>성신여대 앞 · 배달전문 냉면 브랜드</p>
            </div>
          </div>
          <div className={styles.locationStatus} aria-label="언니냉면 배민 입점 준비 중"><span /> 배민 입점 준비 중</div>
        </div>
      </section>

      <section className={styles.inquirySection} id="inquiry">
        <div className={styles.inquiryInner}>
          <div className={styles.inquiryCopy}>
            <span>CONTACT US</span>
            <h2>언니에게<br />물어보세요</h2>
            <p>메뉴, 단체 주문, 배달과 관련해 궁금한 내용을 남겨주세요. 확인 후 남겨주신 연락처로 답변드립니다.</p>
            <div className={styles.inquiryPrivacy}>
              <strong>비공개 문의</strong>
              <span>작성 내용과 연락처는 홈페이지에 공개되지 않습니다.</span>
            </div>
          </div>
          <InquiryForm />
        </div>
      </section>

      <section className={styles.orderSection} id="order">
        <div className={styles.orderBowl} aria-hidden="true"><span /><span /><span /></div>
        <p>BAEMIN COMING SOON</p>
        <h2>언니냉면 배민 입점을<br />준비하고 있습니다</h2>
        <span>언니냉면 주문 페이지가 등록되면 공식 주문 링크를 이곳에 연결하겠습니다.</span>
        <span className={styles.orderButton} aria-disabled="true">입점 준비 중</span>
      </section>

      <footer className={styles.footer}>
        <div>
          <Image src={BRAND_LOGO} alt="언니냉면 컨셉 H 로고" width={1254} height={1254} />
          <p>성신여대 앞 · 배달전문 냉면 브랜드</p>
        </div>
        <div className={styles.footerInfo}>
          <p>서울특별시 성북구 동소문로 90 1층</p>
          <p>사업자 정보 및 고객센터는 오픈 전 업데이트 예정</p>
          <small>© 2026 UNNI NAENGMYEON. ALL RIGHTS RESERVED.</small>
        </div>
      </footer>
    </main>
  );
}
