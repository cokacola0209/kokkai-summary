// src/jobs/backfill.ts
/**
 * 日付範囲を指定して会議録を一括取得するバックフィルジョブ。
 * 既存の processSingleDay() を1日ずつ順番に呼び出す。
 *
 * 使用方法:
 *   npx tsx src/jobs/backfill.ts --from 2025-01-01 --to 2025-01-31
 *   npx tsx src/jobs/backfill.ts --from 2025-01-01 --to 2025-12-31
 *   npx tsx src/jobs/backfill.ts --from 2025-03-01 --to 2025-03-01  # 1日だけ
 *
 * オプション:
 *   --from YYYY-MM-DD     開始日 (必須)
 *   --to   YYYY-MM-DD     終了日 (必須)
 *   --delay <ms>          日間ウェイト (デフォルト: 3000ms)
 *   --dry-run             API を叩かず日付一覧だけ表示
 *
 * 特徴:
 *   - upsert ベースのため途中失敗後に同じ範囲で再実行しても安全
 *   - fetchLog を日ごとに記録するため、既存の運用監視に乗る
 *   - 最終まとめで全体の結果を一覧表示
 */

 import { prisma } from "@/lib/prisma";
 import { processSingleDay } from "./fetch-meetings";
 import type { DayResult } from "./fetch-meetings";

 // ──────────────────────────────────────────
 // CLI 引数パース
 // ──────────────────────────────────────────

 interface BackfillArgs {
   from: string;
   to: string;
   delayMs: number;
   dryRun: boolean;
 }

 function parseArgs(): BackfillArgs {
   const args = process.argv.slice(2);
   let from = "";
   let to = "";
   let delayMs = 3000;
   let dryRun = false;

   for (let i = 0; i < args.length; i++) {
     switch (args[i]) {
       case "--from":
         from = args[++i];
         break;
       case "--to":
         to = args[++i];
         break;
       case "--delay":
         delayMs = Number(args[++i]);
         break;
       case "--dry-run":
         dryRun = true;
         break;
     }
   }

   if (!from || !to) {
     console.error(
       "Usage: npx tsx src/jobs/backfill.ts --from YYYY-MM-DD --to YYYY-MM-DD [--delay ms] [--dry-run]"
     );
     process.exit(1);
   }

   // 日付フォーマット検証
   const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
   if (!dateRegex.test(from) || !dateRegex.test(to)) {
     console.error("Error: Dates must be in YYYY-MM-DD format.");
     process.exit(1);
   }

   if (from > to) {
     console.error("Error: --from must be <= --to.");
     process.exit(1);
   }

   return { from, to, delayMs, dryRun };
 }

 // ──────────────────────────────────────────
 // 日付ユーティリティ
 // ──────────────────────────────────────────

 function generateDateRange(from: string, to: string): string[] {
   const dates: string[] = [];
   const current = new Date(from + "T00:00:00Z");
   const end = new Date(to + "T00:00:00Z");

   while (current <= end) {
     dates.push(current.toISOString().split("T")[0]);
     current.setUTCDate(current.getUTCDate() + 1);
   }

   return dates;
 }

 function sleep(ms: number): Promise<void> {
   return new Promise((resolve) => setTimeout(resolve, ms));
 }

 // ──────────────────────────────────────────
 // まとめ表示
 // ──────────────────────────────────────────

 function printSummary(results: DayResult[]): void {
   const totalDays = results.length;
   const daysWithData = results.filter((r) => r.status !== "no_data").length;
   const daysNoData = results.filter((r) => r.status === "no_data").length;
   const daysSuccess = results.filter((r) => r.status === "success").length;
   const daysPartial = results.filter((r) => r.status === "partial").length;
   const daysError = results.filter((r) => r.status === "error").length;

   const totalFetched = results.reduce((sum, r) => sum + r.fetched, 0);
   const totalSummariesGenerated = results.reduce(
     (sum, r) => sum + r.summariesGenerated,
     0
   );
   const totalSummariesSkipped = results.reduce(
     (sum, r) => sum + r.summariesSkipped,
     0
   );
   const totalSummaryErrors = results.reduce(
     (sum, r) => sum + r.summaryErrors,
     0
   );
   const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

   console.log(`\n${"=".repeat(60)}`);
   console.log(`  BACKFILL SUMMARY`);
   console.log(`${"=".repeat(60)}`);
   console.log(`  対象日数:         ${totalDays} 日`);
   console.log(`  データあり:       ${daysWithData} 日`);
   console.log(`  データなし:       ${daysNoData} 日 (休会日等)`);
   console.log(`  ---`);
   console.log(`  取得・保存件数:   ${totalFetched} 件`);
   console.log(`  要約生成:         ${totalSummariesGenerated} 件`);
   console.log(`  要約スキップ:     ${totalSummariesSkipped} 件 (既存)`);
   console.log(`  要約失敗:         ${totalSummaryErrors} 件`);
   console.log(`  ---`);
   console.log(`  成功日数:         ${daysSuccess} 日`);
   console.log(`  一部エラー日数:   ${daysPartial} 日`);
   console.log(`  エラー日数:       ${daysError} 日`);
   console.log(`  エラー総数:       ${totalErrors} 件`);
   console.log(`${"=".repeat(60)}\n`);

   // エラーがあった日の詳細
   const errorDays = results.filter((r) => r.errors.length > 0);
   if (errorDays.length > 0) {
     console.log(`[Backfill] Error details:`);
     for (const day of errorDays) {
       console.log(`  ${day.date}:`);
       for (const err of day.errors) {
         console.log(`    - ${err}`);
       }
     }
     console.log();
   }
 }

 // ──────────────────────────────────────────
 // メイン
 // ──────────────────────────────────────────

 async function main() {
   const args = parseArgs();
   const dates = generateDateRange(args.from, args.to);

   console.log(`\n${"=".repeat(60)}`);
   console.log(`  BACKFILL START`);
   console.log(`${"=".repeat(60)}`);
   console.log(`  期間:     ${args.from} 〜 ${args.to}`);
   console.log(`  対象日数: ${dates.length} 日`);
   console.log(`  日間遅延: ${args.delayMs}ms`);
   console.log(`  Dry run:  ${args.dryRun}`);
   console.log(`${"=".repeat(60)}\n`);

   // Dry run: 日付一覧を表示して終了
   if (args.dryRun) {
     console.log("[Backfill] Dry run — target dates:");
     for (const date of dates) {
       console.log(`  ${date}`);
     }
     console.log(`\nTotal: ${dates.length} days. No API calls made.`);
     await prisma.$disconnect();
     return;
   }

   const results: DayResult[] = [];

   for (let i = 0; i < dates.length; i++) {
     const date = dates[i];
     const progress = `[${i + 1}/${dates.length}]`;

     console.log(`\n${"─".repeat(50)}`);
     console.log(`${progress} Processing: ${date}`);
     console.log(`${"─".repeat(50)}`);

     try {
       const result = await processSingleDay(date);
       results.push(result);

       console.log(
         `${progress} Done: ${date} → status=${result.status}, fetched=${result.fetched}, ` +
           `summaries=${result.summariesGenerated}, skipped=${result.summariesSkipped}, ` +
           `errors=${result.errors.length}`
       );
     } catch (err) {
       console.error(`${progress} Unexpected error for ${date}:`, err);
       results.push({
        date,
        fetched: 0,
        saved: 0,
        updated: 0,
        skipped: 0,
        summariesGenerated: 0,
        summariesSkipped: 0,
        summaryErrors: 0,
        errors: [String(err)],
        status: "error",
      });
     }

     // 最終日以外は日間ウェイト
     if (i < dates.length - 1) {
       console.log(`${progress} Waiting ${args.delayMs}ms before next day...`);
       await sleep(args.delayMs);
     }
   }

   // まとめ出力
   printSummary(results);

   await prisma.$disconnect();
 }

 main().catch((err) => {
   console.error("[Backfill] Fatal error:", err);
   prisma.$disconnect().finally(() => process.exit(1));
 });
