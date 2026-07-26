"use client";

import styles from "./page.module.css";

export default function RecipePrintActions() {
  return (
    <div className={styles.printActions} aria-label="레시피 출력 도구">
      <button type="button" onClick={() => window.print()}>
        A4 출력
      </button>
      <button type="button" onClick={() => window.print()}>
        PDF 저장
      </button>
    </div>
  );
}
