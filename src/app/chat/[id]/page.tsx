// AADS-190 P0: /chat/<id> dynamic route -> /chat#<id> redirect
// hash-based session restore (page.tsx:1175) auto-activates the session.
"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ChatIdRedirect() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    const id = params?.id;
    if (typeof window === "undefined") return;
    if (id && typeof id === "string" && id.trim()) {
      window.location.replace(`/chat#${encodeURIComponent(id)}`);
    } else {
      router.replace("/chat");
    }
  }, [params, router]);

  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",color:"#888",fontSize:"14px"}}>
      세션 복원 중...
    </div>
  );
}
