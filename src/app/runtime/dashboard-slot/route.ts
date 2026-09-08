import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const port = process.env.PORT || null;
  const slot = port === "3100" ? "blue" : port === "3101" ? "green" : null;

  return NextResponse.json(
    {
      component: "dashboard",
      slot,
      port,
      release_sha: process.env.AADS_RELEASE_SHA || null,
      observed_at: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
