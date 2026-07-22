import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import BrandNav from "../BrandNav";
import styles from "./page.module.css";

const ASSET_ROOT = "/brands/unni-naengmyeon/banners-20260722";
const LOGO = "/brands/unni-naengmyeon/bowlcut-logo-concepts-20260722/concept-h-wordmark-noodles.png";

const menuRows = [
  ["외할머니 명태회냉면", "13,000원"],
  ["물비냉 언니냉면", "10,500원"],
  ["물냉면 · 비빔냉면", "10,000원"],
];

const setRows = [
  ["냉면 + 수제돈까스", "15,500원"],
  ["냉면 + 찐만두", "15,000원"],
  ["냉면 + 몽땅 SET", "19,500원"],
];

export const metadata: Metadata = {
  title: "언니냉면 600×1200 양면 입간판 시안",
  description: "실외형 600×1200mm 양면 입간판을 위한 언니냉면 디자인 시안 3세트입니다.",
};

function BannerLogo({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`${styles.bannerLogo} ${inverse ? styles.inverseLogo : ""}`}>
      <Image src={LOGO} alt="" width={1254} height={1254} />
      <strong>언니냉면</strong>
    </div>
  );
}

function DownloadLink({ file, children }: { file: string; children: React.ReactNode }) {
  return <a className={styles.download} href={`${ASSET_ROOT}/print/${file}`} download>{children}</a>;
}

function ConceptA() {
  return (
    <article className={styles.concept}>
      <div className={styles.conceptHeading}><div><span>CONCEPT A</span><h2>클래식 시그니처</h2></div><p>오프화이트와 코랄 조합으로 친근하고 음식이 크게 보이는 추천안</p></div>
      <div className={styles.pair}>
        <div>
          <div className={`${styles.banner} ${styles.aFront}`} data-export="concept-a-front">
            <Image className={styles.coverImage} src={`${ASSET_ROOT}/concept-a-classic-food.png`} alt="냉면과 돈까스 음식 이미지" fill sizes="600px" priority />
            <div className={styles.aTop}>
              <BannerLogo />
              <span className={styles.kicker}>성신여대 앞 · 배달전문</span>
              <h3>언니가 제대로<br /><em>말아주는 냉면</em></h3>
              <p>시원하게 · 매콤하게 · 든든하게</p>
            </div>
            <div className={styles.bottomRibbon}><b>언니냉면 배민 입점 준비 중</b><span>서울 성북구 동소문로 90 1층</span></div>
          </div>
          <DownloadLink file="concept-a-front.png">A 앞면 PNG</DownloadLink>
        </div>
        <div>
          <div className={`${styles.banner} ${styles.aBack}`} data-export="concept-a-back">
            <div className={styles.backPattern} aria-hidden="true">언</div>
            <BannerLogo inverse />
            <div className={styles.backTitle}><span>UNNI&apos;S PICK</span><h3>오늘은<br />뭐 먹을래?</h3></div>
            <div className={styles.menuBoard}>{menuRows.map(([name, price], i) => <div key={name}><i>0{i + 1}</i><b>{name}</b><strong>{price}</strong></div>)}</div>
            <div className={styles.orderBadge}><span>BAEMIN</span><b>입점 준비 중</b><small>성신여대 앞 · 배달전문</small></div>
          </div>
          <DownloadLink file="concept-a-back.png">A 뒷면 PNG</DownloadLink>
        </div>
      </div>
    </article>
  );
}

function ConceptB() {
  return (
    <article className={styles.concept}>
      <div className={styles.conceptHeading}><div><span>CONCEPT B</span><h2>볼드 나이트</h2></div><p>딥그린과 강한 대비로 저녁 영업·원거리 가독성을 높인 시안</p></div>
      <div className={styles.pair}>
        <div>
          <div className={`${styles.banner} ${styles.bFront}`} data-export="concept-b-front">
            <Image className={styles.coverImage} src={`${ASSET_ROOT}/concept-b-bold-food.png`} alt="얼음 위 비빔냉면 음식 이미지" fill sizes="600px" />
            <div className={styles.bShade} />
            <div className={styles.bTop}>
              <BannerLogo inverse />
              <p>오늘, 냉면<br /><b>당기는 날</b></p>
              <div><span>살얼음 육수</span><span>수제 다대기</span><span>푸짐한 고명</span></div>
            </div>
            <div className={styles.bFooter}>배달전문 · 성신여대점</div>
          </div>
          <DownloadLink file="concept-b-front.png">B 앞면 PNG</DownloadLink>
        </div>
        <div>
          <div className={`${styles.banner} ${styles.bBack}`} data-export="concept-b-back">
            <div className={styles.bIce} aria-hidden="true" />
            <BannerLogo inverse />
            <span className={styles.bSmall}>COOL · SPICY · HEARTY</span>
            <h3>시원하게<br /><em>말아줄게</em></h3>
            <div className={styles.bFeature}><b>대표 메뉴</b><strong>물비냉 언니냉면</strong><span>시원한 육수와 비빔 양념을 한 그릇에</span><i>10,500원</i></div>
            <div className={styles.bOrder}><b>배민 입점 준비 중</b><span>공식 주문 링크는 등록 후 안내</span></div>
          </div>
          <DownloadLink file="concept-b-back.png">B 뒷면 PNG</DownloadLink>
        </div>
      </div>
    </article>
  );
}

function ConceptC() {
  return (
    <article className={styles.concept}>
      <div className={styles.conceptHeading}><div><span>CONCEPT C</span><h2>아이스 팝</h2></div><p>아이스블루와 리듬감 있는 카피로 젊고 산뜻하게 보이는 시안</p></div>
      <div className={styles.pair}>
        <div>
          <div className={`${styles.banner} ${styles.cFront}`} data-export="concept-c-front">
            <Image className={styles.coverImage} src={`${ASSET_ROOT}/concept-c-fresh-food.png`} alt="냉면과 만두 음식 이미지" fill sizes="600px" />
            <div className={styles.cTop}>
              <BannerLogo />
              <div className={styles.cWords}><span>시원</span><span>매콤</span><span>든든</span></div>
              <h3>오늘 한 끼,<br /><em>언니가 챙길게</em></h3>
            </div>
            <div className={styles.cBubble}>배달<br />전문</div>
          </div>
          <DownloadLink file="concept-c-front.png">C 앞면 PNG</DownloadLink>
        </div>
        <div>
          <div className={`${styles.banner} ${styles.cBack}`} data-export="concept-c-back">
            <div className={styles.cSun} aria-hidden="true" />
            <BannerLogo />
            <div className={styles.cBackTitle}><span>UNNI&apos;S FULL SET</span><h3>혼자도 둘이도<br />푸짐하게!</h3><p>냉면과 사이드를 한 번에 즐기는 든든한 세트</p></div>
            <div className={styles.setBoard}>{setRows.map(([name, price]) => <div key={name}><b>{name}</b><strong>{price}</strong></div>)}</div>
            <div className={styles.cFooter}><b>성신여대점</b><span>서울 성북구 동소문로 90 1층 · 배달전문</span></div>
          </div>
          <DownloadLink file="concept-c-back.png">C 뒷면 PNG</DownloadLink>
        </div>
      </div>
    </article>
  );
}

export default function UnniBannerConceptsPage() {
  return (
    <main className={styles.page} style={{ "--banner-width": "600px" } as CSSProperties}>
      <BrandNav />
      <section className={styles.intro}>
        <span>OUTDOOR BANNER DESIGN</span>
        <h1>600 × 1200<br />양면 입간판 시안</h1>
        <p>실외형 1:2 비율을 기준으로 앞·뒷면 3세트를 구성했습니다. 실제 발주 전 인쇄소의 재단선·여백·출력 프로파일을 확인해 최종 원고로 변환해야 합니다.</p>
        <div><b>3 CONCEPTS</b><b>6 SIDES</b><b>DOUBLE-SIDED</b></div>
      </section>
      <section className={styles.recommend}><span>CTO RECOMMENDATION</span><strong>A안 · 클래식 시그니처</strong><p>로고, 핵심 카피, 음식 사진의 읽히는 순서가 가장 명확해 매장 앞 유동 고객에게 적합합니다.</p></section>
      <div className={styles.concepts}><ConceptA /><ConceptB /><ConceptC /></div>
      <section className={styles.productionNote}>
        <h2>인쇄 제작 메모</h2>
        <ul>
          <li><b>완성 비율</b><span>600 × 1200mm · 1:2</span></li>
          <li><b>현재 파일</b><span>시안 확인용 PNG · 앞/뒤 6장</span></li>
          <li><b>최종 발주 전</b><span>인쇄소 도련, 타공 위치, 안전 여백, CMYK 프로파일 확인</span></li>
        </ul>
      </section>
    </main>
  );
}
