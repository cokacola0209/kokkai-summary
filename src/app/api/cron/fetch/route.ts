// src/app/api/cron/fetch/route.ts
/**
 * Vercel Cron / 外部 cron webhook 用エンドポイント
 * GET /api/cron/fetch?date=YYYY-MM-DD
 * Header: Authorization: Bearer <CRON_SECRET>
 *
 * 処理内容:
 * 1. NDL APIから指定日（デフォルト:前日）の会議録を取得
 * 2. Meeting / Speech をDB保存
 * 3. 要約を生成
 * 4. 管理者まとめ（AI下書き）を生成
 * 5. FetchLogに記録
 *
 * 注意:
 * - 国会会議録検索システムAPIの利用条件を遵守すること
 * - 本番の継続的・営利利用前に利用条件確認と必要申請を行うこと
 * - 高頻度アクセスを避けること（1日1回推奨）
 *
 * vercel.json 例:
 * { "crons": [{ "path": "/api/cron/fetch", "schedule": "0 20 * * *" }] }
 */
 export const dynamic = "force-dynamic";
 export const maxDuration = 300; // 5分（Vercel Pro対応）

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

   const date = req.nextUrl.searchParams.get("date") ?? getYesterday();

   try {
     const records = await fetchMeetingsByDate({ date });
     let fetched = 0;
     let summariesGenerated = 0;
     const errors: string[] = [];

     for (const record of records) {
       try {
         // Meeting upsert
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

         // Speeches upsert（delete & recreate）
         await prisma.speech.deleteMany({ where: { meetingId: meeting.id } });
         const speechData = (record.speechRecord ?? [])
           .filter((s: any) => s.speech?.trim())
           .map((s: any) => ({
             meetingId: meeting.id,
             speaker: s.speaker || "不明",
             speakerGroup: s.speakerGroup || null,
             order: s.speechOrder,
             text: s.speech,
           }));

         if (speechData.length > 0) {
           await prisma.speech.createMany({ data: speechData });
         }

         // 要約生成（既存がなければ）
         const existingSummary = await prisma.summary.findUnique({
           where: { meetingId: meeting.id },
         });
         if (!existingSummary) {
           try {
             await generateSummary(meeting.id);
             summariesGenerated++;
           } catch (e) {
             errors.push(`summary:${meeting.id}: ${String(e)}`);
           }
         }

         fetched++;
       } catch (e) {
         errors.push(`${record.issueID}: ${String(e)}`);
       }
     }

     // 管理者まとめ生成（会議があった場合のみ）
     let editorNoteGenerated = false;
     if (fetched > 0) {
       try {
         const { generateDailyEditorNote } = await import(
           "@/lib/editor-note/generateDailyEditorNote"
         );
         await generateDailyEditorNote(new Date(date));
         editorNoteGenerated = true;
       } catch (e) {
         errors.push(`editor-note: ${String(e)}`);
       }
     }

     // ログ記録
     await prisma.fetchLog.create({
       data: {
         date: new Date(date),
         status:
           errors.length === 0
             ? "success"
             : fetched > 0
             ? "partial"
             : "error",
         fetched,
         errors,
       },
     });

     return NextResponse.json({
       ok: true,
       date,
       fetched,
       summariesGenerated,
       editorNoteGenerated,
       errors,
     });
   } catch (err) {
     return NextResponse.json({ error: String(err) }, { status: 500 });
   }
 }
