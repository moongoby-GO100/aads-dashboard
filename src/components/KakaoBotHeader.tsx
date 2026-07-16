"use client";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/auth";

export default function KakaoBotHeader({ title }: { title: string }) {
  const router = useRouter();
  const handleLogout = () => { logout(); router.push("/login"); };

  return (
    <header style={{ background: "#FFFFFF", borderBottom: "1px solid #E5E7EB", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <h2 style={{ fontSize: "14px", fontWeight: "600", color: "#1A1A1A", margin: 0 }}>{title}</h2>
      <button type="button" onClick={handleLogout} style={{ background: "transparent", border: "1px solid #E5E7EB", color: "#6B7280", padding: "5px 12px", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}>로그아웃</button>
    </header>
  );
}
