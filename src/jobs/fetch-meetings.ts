// src/jobs/fetch-meetings.ts
/**
 * 会議録を NDL API から取得して DB に保存するバッチジョブ。
 *
 * 使用方法:
 *   npx tsx src/jobs/fetch-meetings.ts            # 前日
 *   npx tsx src/jobs/fetch-meetings.ts 2024-05-01 # 指定日
 *
 * cron 例 (毎朝 5:00 JST = UTC 20:00 前日):
 *   0 20 * * * cd /path/to/project && npx tsx src/jobs/fetch-meetings.ts >> logs/fetch.log 2>&1
 */

 import { prisma } from "@/lib/prisma";
 import { fetchMeetingsByDate } from "@/lib/ndl/client";
 import { generateSummary } from "@/lib/summarizer";
 import type { NdlMeetingRecord, NdlSpeechRecord } from "@/types/ndl";

 // ──────────────────────────────────────────
 // 型定義
 // ──────────────────────────────────────────

 export interface DayResult {
   date: string;
   fetched: number;        // APIから取得できた会議数
   saved: number;          // DBに新規保存した会議数
   updated: number;        // speeches が変化して更新した会議数
   skipped: number;        // 変化なしでスキップした会議数
   summariesGenerated: number;
   summariesSkipped: number;
   summaryErrors: number;
   errors: string[];
   status: "success" | "partial" | "error" | "no_data";
 }

 // ──────────────────────────────────────────
 // ヘルパー
 // ──────────────────────────────────────────

 function formatLocalDate(d: Date): string {
   const y = d.getFullYear();
   const m = String(d.getMonth() + 1).padStart(2, "0");
   const day = String(d.getDate()).padStart(2, "0");
   return `${y}-${m}-${day}`;
 }

 function getTargetDate(arg?: string): string {
   if (arg) return arg;
   const d = new Date();
   d.setDate(d.getDate() - 1);
   return formatLocalDate(d);
 }

 async function upsertMeeting(record: NdlMeetingRecord): Promise<string> {
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
     update: {
       date: new Date(record.date),
       house: record.nameOfHouse,
       nameOfMeeting: record.nameOfMeeting,
       issue: record.issue || null,
       url: record.meetingURL,
       rawJson: record as object,
       updatedAt: new Date(),
     },
   });
   return meeting.id;
 }

 async function upsertSpeeches(
   meetingId: string,
   speeches: NdlSpeechRecord[]
 ): Promise<void> {
   await prisma.speech.deleteMany({ where: { meetingId } });

   const data = speeches
     .filter((s) => s.speech && s.speech.trim().length > 0)
     .map((s) => ({
       meetingId,
       speaker: s.speaker || "不明",
       speakerGroup: s.speakerGroup || null,
       order: s.speechOrder,
       text: s.speech,
     }));

   if (data.length > 0) {
     await prisma.speech.createMany({ data });
   }
 }

 /**
  * speeches の簡易ハッシュを生成する。
  * speechOrder + speaker + text の先頭100文字を連結してハッシュ代わりに使う。
  * 全文比較はコスト高のため、変化の検知に十分な粒度に絞っている。
  * NDL API のレスポンスに speeches が含まれているので追加 API 呼び出しは不要。
  */
 function buildSpeechFingerprint(speeches: NdlSpeechRecord[]): string {
   return speeches
     .filter((s) => s.speech?.trim())
     .map((s) => `${s.speechOrder}:${s.speaker}:${(s.speech ?? "").slice(0, 100)}`)
     .join("|");
 }

 // ──────────────────────────────────────────
 // コア処理 (1日分)
 // ──────────────────────────────────────────

 /**
  * 指定日の会議録を取得・差分判定・保存・要約する。
  *
  * 差分判定の方針:
  * - DBに存在しない ndlId → 新規 (saved++)
  * - DBに存在し speeches 件数が変化した → 更新 (updated++)
  * - DBに存在し speeches 件数が同じ    → スキップ (skipped++)
  *
  * speeches の全文比較は重いため、件数をプロキシとして使う。
  * NDL API のレスポンス自体に speeches が含まれているので追加 API 呼び出しは不要。
  */
 export async function processSingleDay(targetDate: string): Promise<DayResult> {
   console.log(`\n========================================`);
   console.log(`[Fetch Job] Target date: ${targetDate}`);
   console.log(`========================================`);

   const result: DayResult = {
     date: targetDate,
     fetched: 0,
     saved: 0,
     updated: 0,
     skipped: 0,
     summariesGenerated: 0,
     summariesSkipped: 0,
     summaryErrors: 0,
     errors: [],
     status: "success",
   };

   try {
     const records = await fetchMeetingsByDate({ date: targetDate });
     result.fetched = records.length;

     if (records.length === 0) {
       console.log(`[Job] No meetings found for ${targetDate}`);
       result.status = "no_data";
       await prisma.fetchLog.create({
         data: {
           date: new Date(targetDate),
           status: "success",
           fetched: 0,
           errors: [],
         },
       });
       return result;
     }

     // ── 差分判定のために既存 DB データを一括取得（N+1 回避）──
     // speeches の fingerprint 比較用に order/speaker/text 先頭を取得する
     const existingMeetings = await prisma.meeting.findMany({
       where: {
         ndlId: { in: records.map((r) => r.issueID) },
       },
       select: {
         id: true,
         ndlId: true,
         speeches: {
           select: { order: true, speaker: true, text: true },
           orderBy: { order: "asc" },
         },
       },
     });
     const existingMap = new Map(
       existingMeetings.map((m) => [m.ndlId, m])
     );

     for (const record of records) {
       try {
         const existing = existingMap.get(record.issueID);
         const isNew = !existing;

         // ── 常に metadata を upsert する ──
         // speeches の変化有無に関わらず title / issue / url / rawJson を最新に保つ
         const meetingId = await upsertMeeting(record);

         // ── speeches の差分判定（簡易ハッシュ比較）──
         const incomingFingerprint = buildSpeechFingerprint(record.speechRecord ?? []);
         const existingFingerprint = existing
           ? existing.speeches
               .map((s) => `${s.order}:${s.speaker}:${s.text.slice(0, 100)}`)
               .join("|")
           : "";

         const speechesChanged = incomingFingerprint !== existingFingerprint;

         if (!isNew && !speechesChanged) {
           // speeches に変化なし → speeches の delete/recreate をスキップ
           console.log(
             `[Job] SKIP  ${record.nameOfHouse} ${record.nameOfMeeting} ` +
             `(metadata updated, speeches unchanged)`
           );
           result.skipped++;
         } else {
           // 新規 or speeches に変化あり → speeches を再保存
           await upsertSpeeches(meetingId, record.speechRecord ?? []);

           if (isNew) {
             console.log(
               `[Job] NEW   ${record.nameOfHouse} ${record.nameOfMeeting}`
             );
             result.saved++;
           } else {
             console.log(
               `[Job] UPDATE ${record.nameOfHouse} ${record.nameOfMeeting} ` +
               `(speeches changed)`
             );
             result.updated++;
           }
         }

         // 要約生成（既存があればスキップ）
         const existingSummary = await prisma.summary.findUnique({
           where: { meetingId },
           select: { id: true },
         });
         if (!existingSummary) {
           console.log(`[Job] Generating summary for ${meetingId}...`);
           try {
             await generateSummary(meetingId);
             result.summariesGenerated++;
           } catch (e) {
             // ✅ 追加: スタックトレースを含む完全なエラーを Vercel Logs に出力
             console.error(`[Job] Summary failed for meetingId=${meetingId}:`, e);
             result.errors.push(`summary:${meetingId}: ${String(e)}`);
             result.summaryErrors++;
           }
         } else {
           result.summariesSkipped++;
         }
       } catch (recordErr) {
         console.error(`[Job] Failed for ${record.issueID}:`, recordErr);
         result.errors.push(`record:${record.issueID}: ${String(recordErr)}`);
       }
     }

     // ── サマリーログ ──
     console.log(`\n[Job] ---- ${targetDate} 結果 ----`);
     console.log(`  API取得: ${result.fetched}件`);
     console.log(`  新規:    ${result.saved}件`);
     console.log(`  更新:    ${result.updated}件`);
     console.log(`  スキップ: ${result.skipped}件`);
     console.log(`  要約生成: ${result.summariesGenerated}件`);
     console.log(`  要約スキップ: ${result.summariesSkipped}件`);
     if (result.errors.length > 0) {
       console.log(`  エラー:  ${result.errors.length}件`);
     }

     result.status =
       result.errors.length === 0
         ? "success"
         : result.fetched > 0
           ? "partial"
           : "error";

     await prisma.fetchLog.create({
       data: {
         date: new Date(targetDate),
         status: result.status,
         fetched: result.fetched,
         errors: result.errors,
       },
     });
   } catch (err) {
     console.error(`[Job] Fatal error for ${targetDate}:`, err);
     result.status = "error";
     result.errors.push(String(err));

     await prisma.fetchLog.create({
       data: {
         date: new Date(targetDate),
         status: "error",
         fetched: result.fetched,
         errors: [String(err)],
       },
     });
   }

   return result;
 }

 // ──────────────────────────────────────────
 // CLI エントリポイント
 // ──────────────────────────────────────────

 async function main() {
   const targetDate = getTargetDate(process.argv[2]);
   try {
     const result = await processSingleDay(targetDate);
     if (result.status === "error" && result.fetched === 0) {
       process.exit(1);
     }
   } finally {
     await prisma.$disconnect();
   }
 }

 const isDirectRun = process.argv[1]?.includes("fetch-meetings") ?? false;
 if (isDirectRun) {
   main();
 }
