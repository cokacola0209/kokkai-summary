// src/jobs/fetch-meetings.ts
/**
 * 前日分の会議録を NDL API から取得して DB に保存するバッチジョブ。
 *
 * 使用方法:
 *   npx tsx src/jobs/fetch-meetings.ts            # 前日
 *   npx tsx src/jobs/fetch-meetings.ts 2024-05-01 # 指定日
 *
 * cron 例 (毎朝 5:00 JST):
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
   fetched: number;
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
   // 既存削除 → 再挿入 (シンプルな冪等戦略)
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

 // ──────────────────────────────────────────
 // コア処理 (1日分) — backfill.ts からも利用
 // ──────────────────────────────────────────

 /**
  * 指定日の会議録を取得・保存・要約する。
  * fetchLog への記録もここで行う。
  */
 export async function processSingleDay(targetDate: string): Promise<DayResult> {
   console.log(`\n========================================`);
   console.log(`[Fetch Job] Target date: ${targetDate}`);
   console.log(`========================================\n`);

   const result: DayResult = {
     date: targetDate,
     fetched: 0,
     summariesGenerated: 0,
     summariesSkipped: 0,
     summaryErrors: 0,
     errors: [],
     status: "success",
   };

   try {
     const records = await fetchMeetingsByDate({ date: targetDate });

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

     for (const record of records) {
       try {
         console.log(
           `\n[Job] Processing: ${record.nameOfHouse} ${record.nameOfMeeting} (${record.issueID})`
         );

         // 1. Meeting + Speech 保存
         const meetingId = await upsertMeeting(record);
         await upsertSpeeches(meetingId, record.speechRecord ?? []);
         result.fetched++;

         // 2. 要約生成 (既存まとめがなければ生成)
         const existingSummary = await prisma.summary.findUnique({
           where: { meetingId },
         });
         if (!existingSummary) {
           console.log(`[Job] Generating summary for ${meetingId}...`);
           try {
             await generateSummary(meetingId);
             console.log(`[Job] Summary generated for ${meetingId}`);
             result.summariesGenerated++;
           } catch (summaryErr) {
             console.error(`[Job] Summary failed for ${meetingId}:`, summaryErr);
             result.errors.push(`summary:${meetingId}: ${String(summaryErr)}`);
             result.summaryErrors++;
           }
         } else {
           console.log(`[Job] Summary already exists for ${meetingId}, skipping.`);
           result.summariesSkipped++;
         }
       } catch (recordErr) {
         console.error(`[Job] Failed for ${record.issueID}:`, recordErr);
         result.errors.push(`record:${record.issueID}: ${String(recordErr)}`);
       }
     }

     // 3. ログ保存
     result.status =
       result.errors.length === 0
         ? "success"
         : result.fetched > 0
           ? "partial"
           : "error";

     await prisma.fetchLog.create({
       data: {
         date: new Date(targetDate),
         status: (result.status as string) === "no_data" ? "success" : result.status,
         fetched: result.fetched,
         errors: result.errors,
       },
     });

     console.log(
       `\n[Job] Completed ${targetDate}. fetched=${result.fetched}, errors=${result.errors.length}`
     );
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
 // CLI エントリポイント (従来と同じ挙動)
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

 // 直接実行時のみ main() を呼ぶ
 // (backfill.ts から import されたときは実行しない)
 const isDirectRun =
   process.argv[1]?.includes("fetch-meetings") ?? false;

 if (isDirectRun) {
   main();
 }
