import Image from "next/image";
import Link from "next/link";
import styles from "./brandShell.module.css";

const BRAND_LOGO = "/brands/unni-naengmyeon/bowlcut-logo-concepts-20260722/concept-h-wordmark-noodles.png";

export default function BrandNav() {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href="/unni-naengmyeon" aria-label="언니냉면 홈">
          <Image src={BRAND_LOGO} alt="바가지머리와 냉면 그릇을 결합한 언니냉면 컨셉 H 로고" width={1254} height={1254} priority />
          <span aria-hidden="true">언니냉면</span>
        </Link>
        <nav className={styles.nav} aria-label="언니냉면 브랜드 메뉴">
          <Link href="/unni-naengmyeon">홈</Link>
          <Link href="/unni-naengmyeon/brand/logo">로고 가이드</Link>
          <Link href="/unni-naengmyeon/brand/banners">입간판·픽업존</Link>
        </nav>
      </div>
    </header>
  );
}
