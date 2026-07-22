"use client";

import { FormEvent, useState } from "react";
import styles from "./page.module.css";

type FormStatus = "idle" | "submitting" | "success" | "error";

export default function InquiryForm() {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [notice, setNotice] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setStatus("submitting");
    setNotice("");

    try {
      const response = await fetch("/api/v1/unni-naengmyeon/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          contact: data.get("contact"),
          subject: data.get("subject"),
          message: data.get("message"),
          privacy_consent: data.get("privacy_consent") === "on",
          website: data.get("website"),
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.detail || "문의 접수에 실패했습니다.");
      }

      form.reset();
      setStatus("success");
      setNotice(
        result.reference
          ? `문의가 접수되었습니다. 접수번호 ${String(result.reference).slice(0, 8).toUpperCase()}`
          : "문의가 접수되었습니다."
      );
    } catch (error) {
      setStatus("error");
      setNotice(error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.");
    }
  }

  return (
    <form className={styles.inquiryForm} onSubmit={handleSubmit}>
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="website">웹사이트</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className={styles.formRow}>
        <label>
          <span>이름</span>
          <input name="name" type="text" maxLength={50} autoComplete="name" required placeholder="이름을 입력해 주세요" />
        </label>
        <label>
          <span>연락처</span>
          <input name="contact" type="text" maxLength={100} autoComplete="tel" required placeholder="전화번호 또는 이메일" />
        </label>
      </div>

      <label>
        <span>문의 유형</span>
        <select name="subject" defaultValue="메뉴 문의">
          <option>메뉴 문의</option>
          <option>단체 주문 문의</option>
          <option>배달 및 주문 문의</option>
          <option>제휴 문의</option>
          <option>기타 문의</option>
        </select>
      </label>

      <label>
        <span>문의 내용</span>
        <textarea name="message" minLength={10} maxLength={2000} required placeholder="문의 내용을 10자 이상 입력해 주세요" />
      </label>

      <label className={styles.consentLabel}>
        <input name="privacy_consent" type="checkbox" required />
        <span>문의 답변을 위해 이름·연락처·문의 내용을 수집하는 데 동의합니다. 접수 정보는 답변 및 고객 응대 목적으로만 사용됩니다.</span>
      </label>

      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "접수 중…" : "문의 접수하기"}
      </button>

      <p className={`${styles.formNotice} ${status === "error" ? styles.formError : ""}`} role="status" aria-live="polite">
        {notice}
      </p>
    </form>
  );
}
