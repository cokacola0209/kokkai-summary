// src/app/api/regenerate/[id]/route.ts
/**
 * 管理用 API: 要約の手動再生成
 * POST /api/regenerate/:meetingId
 * Header: Authorization: Bearer <ADMIN_SECRET>
 */
import { NextRequest, NextResponse } from "next/server";
import { regenerateSummary } from "@/lib/summarizer";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const secret = process.env.ADMIN_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    await regenerateSummary(params.id);
    return NextResponse.json({ ok: true, meetingId: params.id });
  } catch (err) {
    console.error("[API /regenerate]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
