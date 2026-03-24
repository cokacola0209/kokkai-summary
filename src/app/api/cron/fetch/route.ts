// src/app/api/cron/fetch/route.ts
/**
 * Vercel Cron / 外部 cron webhook 用エンドポイント
 *
 * 通常実行（Vercel Cron から毎日呼ばれる）:
 *   GET /api/cron/fetch
 *   → 直近 WINDOW_DAYS（デフォルト14日）を差分チェック
 *   → 新規・更新のある会議のみ保存・要約
 *
 * 手動 backfill（特定期間を指定して再取得したい場合）:
 *   GET /api/cron/fetch?from=2026-03-12&to=2026-03-13
 *   → 指定期間内の日付をすべて処理（差分チェックあり）
 *
 * 認証:
 *   Header: Authorization: Bearer <CRON_SECRET>
 *   または Query: ?token=<CRON_SECRET>
 *
 * 注意:
 * - 国会会議録検索システムAPIの利用条件を遵守すること
 * - 高頻度アクセスを避けること（1日1回推奨）
 * - backfill は対象期間が長いほど処理時間が増えるため注意
 *
 * vercel.json 設定例:
 *   { "crons": [{ "path": "/api/cron/fetch", "schedule": "0 20 * * *" }] }
 */

 export const dynamic = "force-dynamic";
 export const maxDuration = 300; // 5分（Vercel Pro）

 import { NextRequest, NextResponse } from "next/server";
 import { prisma } from "@/lib/prisma";
 import { processSingleDay } from "@/jobs/fetch-meetings";
 import type { DayResult } from "@/jobs/fetch-meetings";

 // ──────────────────────────────────────────
 // 定数
 // ──────────────────────────────────────────

 /** 通常実行時に確認する日数（本日を含まない過去N日） */
 const WINDOW_DAYS = Number(process.env.FETCH_WINDOW_DAYS ?? "14");

 /** backfill で指定できる最大日数 */
 const BACKFILL_MAX_DAYS = 31;

 // ──────────────────────────────────────────
 // ユーティリティ
 // ──────────────────────────────────────────

 /** YYYY-MM-DD 形式かどうかを検証する */
 function isValidDate(s: string): boolean {
   if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
   const d = new Date(s);
   // new Date("2026-02-30") のような不正日付は Invalid Date になる
   return !isNaN(d.getTime());
 }

 function formatDate(d: Date): string {
   const y = d.getFullYear();
   const m = String(d.getMonth() + 1).padStart(2, "0");
   const day = String(d.getDate()).padStart(2, "0");
   return `${y}-${m}-${day}`;
 }

 /**
  * from〜to の日付リストを生成する（両端を含む、降順）
  * 降順にすることで直近日を優先的に処理できる
  */
 function buildDateRange(from: string, to: string): string[] {
   const dates: string[] = [];
   const start = new Date(from);
   const end = new Date(to);

   // from > to の指定ミスを許容する
   const [earlier, later] = start <= end ? [start, end] : [end, start];

   const cur = new Date(later);
   while (cur >= earlier) {
     dates.push(formatDate(cur));
     cur.setDate(cur.getDate() - 1);
   }
   return dates;
 }

 /**
  * 直近 WINDOW_DAYS 日の日付リストを生成する（昨日〜WINDOW_DAYS日前、降順）
  * 本日は NDL API にデータが存在しないことが多いため含めない
  */
 function buildWindowDates(windowDays: number): string[] {
   const dates: string[] = [];
   const now = new Date();
   for (let i = 1; i <= windowDays; i++) {
     const d = new Date(now);
     d.setDate(d.getDate() - i);
     dates.push(formatDate(d));
   }
   return dates; // 降順（昨日→14日前）
 }

 // ──────────────────────────────────────────
 // ハンドラ
 // ──────────────────────────────────────────

 export async function GET(req: NextRequest) {
   // ── 認証 ──
   const secret = process.env.CRON_SECRET;
   if (secret) {
     const auth =
       req.headers.get("authorization") ??
       req.nextUrl.searchParams.get("token");
     if (auth !== `Bearer ${secret}` && auth !== secret) {
       return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
     }
   }

   const searchParams = req.nextUrl.searchParams;
   const fromParam = searchParams.get("from");
   const toParam = searchParams.get("to");

   // ── 対象日付リストを決定 ──
   let targetDates: string[];
   let mode: "window" | "backfill";

   if (fromParam) {
     // ── バリデーション ──
     if (!isValidDate(fromParam)) {
       return NextResponse.json(
         { error: `invalid 'from': "${fromParam}" is not a valid YYYY-MM-DD date` },
         { status: 400 }
       );
     }
     const to = toParam ?? fromParam;
     if (!isValidDate(to)) {
       return NextResponse.json(
         { error: `invalid 'to': "${to}" is not a valid YYYY-MM-DD date` },
         { status: 400 }
       );
     }

     // backfill モード: ?from=YYYY-MM-DD&to=YYYY-MM-DD
     targetDates = buildDateRange(fromParam, to);

     if (targetDates.length > BACKFILL_MAX_DAYS) {
       return NextResponse.json(
         {
           error: `backfill range too large: ${targetDates.length} days (max ${BACKFILL_MAX_DAYS})`,
           hint: `split into smaller ranges or set BACKFILL_MAX_DAYS env var`,
         },
         { status: 400 }
       );
     }

     mode = "backfill";
     console.log(
       `[Cron] backfill mode: ${fromParam} → ${to} (${targetDates.length}日)`
     );
   } else {
     // 通常モード: 直近 WINDOW_DAYS 日を差分チェック
     targetDates = buildWindowDates(WINDOW_DAYS);
     mode = "window";
     console.log(
       `[Cron] window mode: 直近${WINDOW_DAYS}日 ` +
       `(${targetDates[targetDates.length - 1]} 〜 ${targetDates[0]})`
     );
   }

   // ── 処理ループ ──
   const startTime = Date.now();
   const dayResults: DayResult[] = [];
   const allErrors: string[] = [];

   // 集計用カウンタ
   let totalFetched = 0;
   let totalSaved = 0;
   let totalUpdated = 0;
   let totalSkipped = 0;
   let totalSummariesGenerated = 0;

   for (const date of targetDates) {
     try {
       const result = await processSingleDay(date);
       dayResults.push(result);

       totalFetched += result.fetched;
       totalSaved += result.saved;
       totalUpdated += result.updated;
       totalSkipped += result.skipped;
       totalSummariesGenerated += result.summariesGenerated;
       allErrors.push(...result.errors);
     } catch (err) {
       const msg = `${date}: ${String(err)}`;
       console.error(`[Cron] Unexpected error for ${date}:`, err);
       allErrors.push(msg);
     }
   }

   // ── 管理者まとめ生成（新規・更新があった日のみ）──
   const datesWithChanges = dayResults
     .filter((r) => r.saved > 0 || r.updated > 0)
     .map((r) => r.date);

   let editorNotesGenerated = 0;
   if (datesWithChanges.length > 0) {
     try {
       const { generateDailyEditorNote } = await import(
         "@/lib/editor-note/generateDailyEditorNote"
       );
       // 変更があった日の中で最新日のみ生成（基本は昨日の1件）
       // backfill 時は複数日あり得るので全日処理
       for (const d of datesWithChanges) {
         try {
           await generateDailyEditorNote(new Date(d));
           editorNotesGenerated++;
         } catch (e) {
           allErrors.push(`editor-note:${d}: ${String(e)}`);
         }
       }
     } catch (e) {
       allErrors.push(`editor-note: ${String(e)}`);
     }
   }

   const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

   // ── 最終ログ ──
   console.log(`\n[Cron] ════════════ 実行結果 ════════════`);
   console.log(`  モード:       ${mode === "window" ? `直近${WINDOW_DAYS}日` : "backfill"}`);
   console.log(`  対象日数:     ${targetDates.length}日`);
   console.log(`  API取得:      ${totalFetched}件`);
   console.log(`  新規保存:     ${totalSaved}件`);
   console.log(`  更新:         ${totalUpdated}件`);
   console.log(`  スキップ:     ${totalSkipped}件`);
   console.log(`  要約生成:     ${totalSummariesGenerated}件`);
   console.log(`  編集メモ生成: ${editorNotesGenerated}件`);
   console.log(`  エラー:       ${allErrors.length}件`);
   console.log(`  所要時間:     ${elapsed}秒`);
   console.log(`[Cron] ════════════════════════════════`);

   return NextResponse.json({
     ok: true,
     mode,
     targetDates: targetDates.length,
     dateRange: {
       from: targetDates[targetDates.length - 1],
       to: targetDates[0],
     },
     summary: {
       fetched: totalFetched,
       saved: totalSaved,
       updated: totalUpdated,
       skipped: totalSkipped,
       summariesGenerated: totalSummariesGenerated,
       editorNotesGenerated,
       errors: allErrors.length,
     },
     elapsed: `${elapsed}s`,
     errors: allErrors.length > 0 ? allErrors : undefined,
     days: dayResults.map((r) => ({
       date: r.date,
       fetched: r.fetched,
       saved: r.saved,
       updated: r.updated,
       skipped: r.skipped,
       status: r.status,
     })),
   });
 }
