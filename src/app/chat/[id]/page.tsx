// Durable session route. Query is visible to middleware and survives auth redirects.
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
      window.location.replace(`/chat?session=${encodeURIComponent(id)}`);
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
