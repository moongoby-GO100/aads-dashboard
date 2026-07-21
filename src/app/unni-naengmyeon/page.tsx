import type { Metadata, Viewport } from "next";
import Image from "next/image";
import styles from "./page.module.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://aads.newtalk.kr"),
  title: "언니냉면 | 성신여대 배달 냉면",
  applicationName: "언니냉면",
  description: "성신여대 앞 배달전문 냉면 브랜드, 언니냉면입니다. 시원한 물냉면과 매콤한 비빔냉면을 곧 배민에서 만나보세요.",
  keywords: ["언니냉면", "성신여대 냉면", "성북구 냉면", "배달 냉면", "물냉면", "비빔냉면"],
  openGraph: {
    title: "언니냉면 | 언니가 제대로 말아주는 냉면",
    description: "성신여대 앞에서 시작하는 배달전문 냉면 브랜드",
    type: "website",
    locale: "ko_KR",
    images: [{ url: "/brands/unni-naengmyeon/hero-naengmyeon.webp", width: 1440, height: 901, alt: "언니냉면 물냉면 연출 이미지" }],
  },
  icons: {
    icon: [{ url: "/brands/unni-naengmyeon/mark.svg", type: "image/svg+xml" }],
    apple: [{ url: "/brands/unni-naengmyeon/mark.svg" }],
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

const SnowIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M4.2 6.5l15.6 11M19.8 6.5l-15.6 11M8 4l4 2.3L16 4M8 20l4-2.3L16 20M3.8 10.5 8 12l-4.2 1.5M20.2 10.5 16 12l4.2 1.5"/></svg>
);

const FlameIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.8c.6 3.7-2.2 4.9-3.7 7.2-1.1-1-1.5-2.2-1.2-3.6C5.8 8.2 4 10.7 4 13.7a8 8 0 0 0 16 0c0-4.7-3.2-8.7-6.8-10.9Z"/><path d="M12.2 11.1c.3 2-1.5 2.8-1.5 4.4 0 1.2.9 2.1 2 2.1 1.7 0 2.8-1.4 2.8-3.1 0-1.5-.9-2.8-2.3-4.1.1 1.3-.3 2.2-1 2.8"/></svg>
);

export default function UnniNaengmyeonPage() {
  return (
    <main className={styles.site}>
      <a className={styles.skipLink} href="#main-content">본문으로 바로가기</a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.brand} href="#top" aria-label="언니냉면 홈">
            <Image src="/brands/unni-naengmyeon/logo.svg" alt="언니냉면" width={720} height={220} priority />
          </a>
          <nav className={styles.nav} aria-label="주요 메뉴">
            <a href="#menu">메뉴</a>
            <a href="#story">브랜드</a>
            <a href="#location">매장 안내</a>
          </nav>
          <a className={styles.headerCta} href="#order">배민 입점 준비 중</a>
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
              배달의민족 온라인 입점 진행 중
            </div>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.heroBadge}><b>ICE COLD</b><span>끝까지 시원하게</span></div>
            <Image
              src="/brands/unni-naengmyeon/hero-naengmyeon.webp"
              alt="얼음 육수와 메밀면을 담은 물냉면 연출 이미지"
              fill
              priority
              sizes="(max-width: 900px) 100vw, 55vw"
            />
            <span className={styles.imageDisclaimer}>메뉴 연출 이미지</span>
          </div>
        </div>
        <div className={styles.marquee} aria-label="언니냉면 브랜드 키워드">
          <div><span>시원하게</span><i>◆</i><span>매콤하게</span><i>◆</i><span>든든하게</span><i>◆</i><span>언니답게</span><i>◆</i><span>시원하게</span><i>◆</i><span>매콤하게</span></div>
        </div>
      </section>

      <section className={styles.menuSection} id="menu">
        <div className={styles.sectionHeading}>
          <span>OUR MENU</span>
          <h2>오늘은 어떤 냉면?</h2>
          <p>언니냉면의 대표 메뉴부터 먼저 소개합니다.</p>
        </div>
        <div className={styles.menuGrid}>
          <article className={`${styles.menuCard} ${styles.waterCard}`}>
            <span className={styles.menuNumber}>01</span>
            <div className={styles.menuIcon}><SnowIcon /></div>
            <div>
              <span className={styles.menuTag}>COOL &amp; CLEAN</span>
              <h3>언니 물냉면</h3>
              <p>차갑고 개운하게, 한 그릇 끝까지 시원한 정석 물냉면</p>
            </div>
            <span className={styles.menuStatus}>가격 · 구성 준비 중</span>
          </article>
          <article className={`${styles.menuCard} ${styles.spicyCard}`}>
            <span className={styles.menuNumber}>02</span>
            <div className={styles.menuIcon}><FlameIcon /></div>
            <div>
              <span className={styles.menuTag}>SWEET &amp; SPICY</span>
              <h3>언니 비빔냉면</h3>
              <p>입맛 당기는 매콤함과 은근한 달큰함이 어우러진 비빔냉면</p>
            </div>
            <span className={styles.menuStatus}>가격 · 구성 준비 중</span>
          </article>
        </div>
        <p className={styles.menuNotice}>정확한 가격과 최종 구성은 배민 입점 완료 후 공개됩니다.</p>
      </section>

      <section className={styles.storySection} id="story">
        <div className={styles.storyCard}>
          <div className={styles.storyMark} aria-hidden="true">언</div>
          <div className={styles.storyCopy}>
            <span>WHY UNNI?</span>
            <h2>가깝고, 편하고,<br />자꾸 생각나는 한 그릇</h2>
            <p>언니냉면은 열정국밥 성신여대점 주방에서 시작하는 배달전문 냉면 브랜드입니다. 복잡한 말보다 맛있는 한 그릇으로 기억되겠습니다.</p>
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
              <strong>서울특별시 성북구 동소문동5가 67-4</strong>
              <p>열정국밥 성신여대점 샵인샵 · 배달전문</p>
            </div>
          </div>
          <div className={styles.locationStatus}><span /> 현재 배민 입점 준비 중입니다</div>
        </div>
      </section>

      <section className={styles.orderSection} id="order">
        <div className={styles.orderBowl} aria-hidden="true"><span /><span /><span /></div>
        <p>OPENING SOON</p>
        <h2>성신여대 앞에서<br />곧 만나요!</h2>
        <span>배민 입점이 완료되면 주문 링크가 열립니다.</span>
        <button type="button" disabled>배민 주문 준비 중</button>
      </section>

      <footer className={styles.footer}>
        <div>
          <Image src="/brands/unni-naengmyeon/logo.svg" alt="언니냉면" width={720} height={220} />
          <p>열정국밥 성신여대점 샵인샵 · 배달전문</p>
        </div>
        <div className={styles.footerInfo}>
          <p>서울특별시 성북구 동소문동5가 67-4</p>
          <p>사업자 정보 및 고객센터는 오픈 전 업데이트 예정</p>
          <small>© 2026 UNNI NAENGMYEON. ALL RIGHTS RESERVED.</small>
        </div>
      </footer>
    </main>
  );
}
