// src/app/api/cron/fetch/route.ts
/**
 * Vercel Cron / 外部 cron webhook 用エンドポイント
 * GET /api/cron/fetch?date=YYYY-MM-DD
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * vercel.json 例:
 * {
 *   "crons": [{ "path": "/api/cron/fetch", "schedule": "0 20 * * *" }]
 * }
 */
 export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { fetchMeetingsByDate } from "@/lib/ndl/client";
import { prisma } from "@/lib/prisma";
import { generateSummary } from "@/lib/summarizer";

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

export async function GET(req: NextRequest) {
  // 認証
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth =
      req.headers.get("authorization") ??
      req.nextUrl.searchParams.get("token");
    if (auth !== `Bearer ${secret}` && auth !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const date =
    req.nextUrl.searchParams.get("date") ?? getYesterday();

  try {
    const records = await fetchMeetingsByDate({ date });
    let fetched = 0;
    const errors: string[] = [];

    for (const record of records) {
      try {
        const meeting = await prisma.meeting.upsert({
          where: { ndlId: record.issueID },
          create: {
            ndlId: record.issueID,
            date: new Date(record.date),
            house: record.nameOfHouse,
            nameOfMeeting: record.nameOfMeeting,
            issue: record.issue || null,
            url: record.meetingURL,
            rawJson: record as object,
          },
          update: { rawJson: record as object },
        });

        // speeches upsert
        await prisma.speech.deleteMany({ where: { meetingId: meeting.id } });
        const speechData = (record.speechRecord ?? [])
          .filter((s) => s.speech?.trim())
          .map((s) => ({
            meetingId: meeting.id,
            speaker: s.speaker || "不明",
            speakerGroup: s.speakerGroup || null,
            order: s.speechOrder,
            text: s.speech,
          }));
        if (speechData.length > 0) {
          await prisma.speech.createMany({ data: speechData });
        }

        const existingSummary = await prisma.summary.findUnique({
          where: { meetingId: meeting.id },
        });
        if (!existingSummary) {
          await generateSummary(meeting.id);
        }
        fetched++;
      } catch (e) {
        errors.push(`${record.issueID}: ${String(e)}`);
      }
    }

    await prisma.fetchLog.create({
      data: {
        date: new Date(date),
        status: errors.length === 0 ? "success" : fetched > 0 ? "partial" : "error",
        fetched,
        errors,
      },
    });

    return NextResponse.json({ ok: true, date, fetched, errors });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
