import type { Metadata } from "next";
import Image from "next/image";
import BrandNav from "../BrandNav";
import styles from "./page.module.css";

const LOGO_ROOT = "/brands/unni-naengmyeon/bowlcut-logo-concepts-20260722";
const REGISTER_LOGO_JPG = "/brands/unni-naengmyeon/logo-downloads/unni-naengmyeon-logo-1000-square.jpg";

const logoVariants = [
  { file: "concept-d-front-bowlcut-bowl.png", name: "D · 정면 바가지머리" },
  { file: "concept-e-profile-noodle.png", name: "E · 옆얼굴 면발" },
  { file: "concept-f-bowlcut-seal.png", name: "F · 바가지머리 인장" },
  { file: "concept-g-wordmark-wave.png", name: "G · 워드마크 물결" },
  { file: "concept-h-wordmark-noodles.png", name: "H · 메인 로고" },
  { file: "concept-i-wordmark-plaque.png", name: "I · 워드마크 명판" },
];

export const metadata: Metadata = {
  title: "언니냉면 로고 가이드",
  description: "언니냉면 컨셉 H 메인 로고와 브랜드 컬러, 보조 시안 활용 가이드입니다.",
};

export default function UnniLogoGuidePage() {
  return (
    <main className={styles.page}>
      <BrandNav />
      <section className={styles.hero}>
        <div>
          <span>BRAND IDENTITY · 2026</span>
          <h1><strong>언니냉면</strong><small>로고 가이드</small></h1>
          <p>둥근 바가지머리, 중앙 워드마크, 냉면 그릇을 하나로 연결한 컨셉 H를 메인 로고로 사용합니다.</p>
        </div>
        <div className={styles.mainLogo}>
          <div className={styles.primaryLockup}>
            <Image src={`${LOGO_ROOT}/concept-h-wordmark-noodles.png`} alt="바가지머리와 냉면 그릇을 결합한 언니냉면 컨셉 H 메인 로고" width={1254} height={1254} priority />
            <span aria-hidden="true">언니냉면</span>
          </div>
          <b>PRIMARY LOGO · CONCEPT H</b>
        </div>
      </section>

      <section className={styles.rules} aria-labelledby="logo-rules">
        <div className={styles.sectionHeading}>
          <span>USAGE</span>
          <h2 id="logo-rules">멀리서도 한 번에<br />언니냉면답게</h2>
        </div>
        <article className={styles.downloadCard}>
          <div>
            <b>REGISTRATION JPG</b>
            <h3>등록 조건 맞춤 로고 파일</h3>
            <p>560×560 이상 정사각형, 900KB 이하, JPG 등록 조건에 맞춘 흰 배경 로고입니다.</p>
          </div>
          <a href={REGISTER_LOGO_JPG} download="unni-naengmyeon-logo-1000-square.jpg">JPG 다운로드</a>
        </article>
        <div className={styles.ruleGrid}>
          <article><b>01</b><h3>기본 조합</h3><p>컨셉 H 심볼 오른쪽에 굵은 `언니냉면` 워드마크를 배치합니다.</p></article>
          <article><b>02</b><h3>최소 여백</h3><p>로고 바깥에 글자 높이의 절반 이상 여백을 확보합니다.</p></article>
          <article><b>03</b><h3>금지 사항</h3><p>찌그러뜨리기, 임의 외곽선, 과한 그림자와 저대비 배경 사용을 피합니다.</p></article>
        </div>
      </section>

      <section className={styles.palette} aria-labelledby="brand-colors">
        <div className={styles.sectionHeading}>
          <span>COLOR SYSTEM</span>
          <h2 id="brand-colors">시원함과 친근함을<br />함께 담은 색</h2>
        </div>
        <div className={styles.swatches}>
          <div className={styles.green}><b>DEEP GREEN</b><span>#173E35</span></div>
          <div className={styles.coral}><b>UNNI CORAL</b><span>#F45D48</span></div>
          <div className={styles.cream}><b>NOODLE CREAM</b><span>#FFF8EA</span></div>
          <div className={styles.ice}><b>ICE BLUE</b><span>#DDF4FA</span></div>
        </div>
      </section>

      <section className={styles.variants} aria-labelledby="logo-variants">
        <div className={styles.sectionHeading}>
          <span>LOGO ARCHIVE</span>
          <h2 id="logo-variants">메인과 보조 시안</h2>
          <p>H는 대표 로고, 나머지는 이벤트·굿즈·SNS 콘텐츠용 보조 그래픽으로 활용합니다.</p>
        </div>
        <div className={styles.logoGrid}>
          {logoVariants.map((logo) => (
            <article key={logo.file} className={logo.file.startsWith("concept-h") ? styles.selected : undefined}>
              <Image src={`${LOGO_ROOT}/${logo.file}`} alt={logo.name} width={1254} height={1254} />
              <div><strong>{logo.name}</strong><a href={`${LOGO_ROOT}/${logo.file}`} download>PNG 열기</a></div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
