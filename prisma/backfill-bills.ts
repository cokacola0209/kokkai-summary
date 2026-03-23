/**
 * 法案バックフィル（一括投入）スクリプト
 *
 * 衆議院の議案一覧ページ（保存 HTML）を入力として、
 * Bill テーブルへ upsert で法案データを投入する。
 *
 * 使い方:
 *   npx tsx prisma/backfill-bills.ts --html ./data/shugiin_217.html --html ./data/shugiin_219.html
 *   npx tsx prisma/backfill-bills.ts --html ./data/*.html --clean-seed
 *   npx tsx prisma/backfill-bills.ts --html ./data/*.html --dry-run
 *
 * オプション:
 *   --html <path>   入力HTMLファイル（複数指定可）
 *   --clean-seed    seed-bills.ts で投入した仮データを先に削除する
 *   --dry-run       DB変更なし、パース結果の確認のみ
 *   --enacted-only  成立・可決の法案のみ投入する
 */

 import * as fs from "fs";
 import * as path from "path";
 import { PrismaClient } from "@prisma/client";
 import { parseBillsFromHtml, type ParsedBill, type ParseMeta } from "../src/lib/bill-fetcher";

 const prisma = new PrismaClient();

 // ──────────────────────────────────────────
 // seed-bills.ts の billCode 一覧（clean-seed 用）
 // ──────────────────────────────────────────

 const SEED_BILL_CODES = [
   "214-閣法-1", "214-閣法-5", "214-閣法-12", "214-閣法-18",
   "214-閣法-15", "214-閣法-20", "214-閣法-24", "214-閣法-28",
   "214-閣法-31", "214-閣法-33", "214-閣法-36", "214-閣法-22",
   "214-閣法-30", "214-閣法-39", "214-閣法-41", "214-閣法-35",
   "214-閣法-38", "214-衆法-8",  "214-閣法-43", "214-閣法-44",
   "214-衆法-12", "214-参法-5",  "214-閣法-42", "214-参法-3",
   "214-閣法-45", "214-閣法-46", "214-閣法-47", "214-参法-7",
 ];

 // ──────────────────────────────────────────
 // コマンドライン引数パース
 // ──────────────────────────────────────────

 interface CliArgs {
   htmlFiles: string[];
   cleanSeed: boolean;
   dryRun: boolean;
   enactedOnly: boolean;
 }

 function parseArgs(): CliArgs {
   const args = process.argv.slice(2);
   const result: CliArgs = {
     htmlFiles: [],
     cleanSeed: false,
     dryRun: false,
     enactedOnly: false,
   };

   for (let i = 0; i < args.length; i++) {
     switch (args[i]) {
       case "--html":
         i++;
         if (i < args.length) result.htmlFiles.push(args[i]);
         break;
       case "--clean-seed":
         result.cleanSeed = true;
         break;
       case "--dry-run":
         result.dryRun = true;
         break;
       case "--enacted-only":
         result.enactedOnly = true;
         break;
       default:
         // --html なしでファイルパスが渡された場合も受け付ける
         if (args[i].endsWith(".html") || args[i].endsWith(".htm")) {
           result.htmlFiles.push(args[i]);
         } else {
           console.warn(`⚠ 不明な引数: ${args[i]}`);
         }
     }
   }

   return result;
 }

 // ──────────────────────────────────────────
 // ファイル名からメタ情報を推定
 // ──────────────────────────────────────────

 function inferMeta(filePath: string): ParseMeta {
   const fileName = path.basename(filePath);

   // ファイル名から院を推定
   let chamber: "衆議院" | "参議院" = "衆議院";
   if (fileName.includes("sangiin") || fileName.includes("参議院")) {
     chamber = "参議院";
   }

   return {
     fileName,
     chamber,
     fetchedAt: new Date().toISOString().slice(0, 10),
   };
 }

 // ──────────────────────────────────────────
 // メイン処理
 // ──────────────────────────────────────────

 async function main() {
   const args = parseArgs();

   // ── バリデーション ──
   if (args.htmlFiles.length === 0) {
     console.error("❌ HTML ファイルが指定されていません。");
     console.error("");
     console.error("使い方:");
     console.error("  npx tsx prisma/backfill-bills.ts --html ./data/shugiin_217.html");
     console.error("  npx tsx prisma/backfill-bills.ts --html ./data/shugiin_217.html --html ./data/shugiin_219.html");
     console.error("  npx tsx prisma/backfill-bills.ts --html ./data/*.html --clean-seed --dry-run");
     console.error("");
     console.error("オプション:");
     console.error("  --html <path>   入力HTMLファイル（複数指定可）");
     console.error("  --clean-seed    seed 仮データを先に削除");
     console.error("  --dry-run       DB変更なし（確認用）");
     console.error("  --enacted-only  成立・可決のみ投入");
     process.exit(1);
   }

   // ── ファイル存在チェック ──
   for (const f of args.htmlFiles) {
     if (!fs.existsSync(f)) {
       console.error(`❌ ファイルが見つかりません: ${f}`);
       process.exit(1);
     }
   }

   console.log("🏛 法案バックフィルを開始します");
   console.log(`  入力ファイル: ${args.htmlFiles.length} 件`);
   console.log(`  clean-seed: ${args.cleanSeed ? "YES" : "NO"}`);
   console.log(`  dry-run: ${args.dryRun ? "YES" : "NO"}`);
   console.log(`  enacted-only: ${args.enactedOnly ? "YES" : "NO"}`);
   console.log("");

   // ──────────────────────────────────────
   // Phase 1: 全 HTML をパース
   // ──────────────────────────────────────

   const allBills = new Map<string, ParsedBill>();
   const STATUS_PRIORITY: Record<string, number> = {
     enacted: 4,
     passed: 3,
     deliberating: 2,
     submitted: 1,
   };

   for (const filePath of args.htmlFiles) {
     const fileName = path.basename(filePath);
     console.log(`📄 パース中: ${fileName}`);

     const html = fs.readFileSync(filePath, "utf-8");
     const meta = inferMeta(filePath);
     const bills = parseBillsFromHtml(html, meta);

     console.log(`   → ${bills.length} 件の法案を検出`);

     // マージ（重複時はステータス優先度が高い方を採用）
     for (const bill of bills) {
       const existing = allBills.get(bill.billCode);
       if (existing) {
         const ep = STATUS_PRIORITY[existing.status] ?? 0;
         const np = STATUS_PRIORITY[bill.status] ?? 0;
         if (np <= ep) continue;
       }
       allBills.set(bill.billCode, bill);
     }
   }

   let bills = Array.from(allBills.values());

   // enacted-only フィルタ
   if (args.enactedOnly) {
     bills = bills.filter((b) => b.status === "enacted" || b.status === "passed");
   }

   // ── パース結果サマリ ──
   const statusCounts: Record<string, number> = {};
   for (const b of bills) {
     statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1;
   }
   console.log("");
   console.log("📊 パース結果:");
   console.log(`   合計: ${bills.length} 件`);
   for (const [st, count] of Object.entries(statusCounts).sort(([, a], [, b]) => b - a)) {
     const emoji = st === "enacted" ? "✅" : st === "passed" ? "🟢" : st === "deliberating" ? "🟡" : "📝";
     console.log(`   ${emoji} ${st}: ${count} 件`);
   }
   console.log("");

   // ── dry-run なら終了 ──
   if (args.dryRun) {
     console.log("🔍 dry-run モード: DB変更はしません");
     console.log("");

     // サンプル表示（先頭10件）
     console.log("📋 サンプル（先頭10件）:");
     for (const b of bills.slice(0, 10)) {
       const emoji = b.status === "enacted" ? "✅" : b.status === "passed" ? "🟢" : b.status === "deliberating" ? "🟡" : "📝";
       console.log(`   ${emoji} ${b.billCode}: ${b.title.slice(0, 50)}`);
     }
     if (bills.length > 10) {
       console.log(`   ... 他 ${bills.length - 10} 件`);
     }

     if (args.cleanSeed) {
       console.log("");
       console.log(`🗑 clean-seed: 以下の ${SEED_BILL_CODES.length} 件が削除対象です`);
       for (const code of SEED_BILL_CODES) {
         console.log(`   🔸 ${code}`);
       }
     }
     return;
   }

   // ──────────────────────────────────────
   // Phase 2: トランザクションで DB 操作
   // ──────────────────────────────────────

   console.log("💾 DB へ投入中...");

   const result = await prisma.$transaction(
     async (tx) => {
       let deletedBillMeetings = 0;
       let deletedBills = 0;
       let created = 0;
       let updated = 0;

       // ── Phase 2a: seed データ整理 ──
       if (args.cleanSeed) {
         console.log("  🗑 seed 仮データを整理中...");

         // BillMeeting を先に削除
         const bmResult = await tx.billMeeting.deleteMany({
           where: {
             bill: { billCode: { in: SEED_BILL_CODES } },
           },
         });
         deletedBillMeetings = bmResult.count;
         console.log(`     BillMeeting: ${deletedBillMeetings} 件削除`);

         // Bill を削除
         const billResult = await tx.bill.deleteMany({
           where: { billCode: { in: SEED_BILL_CODES } },
         });
         deletedBills = billResult.count;
         console.log(`     Bill: ${deletedBills} 件削除`);
       }

       // ── Phase 2b: 実データ upsert ──
       console.log("  📥 法案データを upsert 中...");

       for (const bill of bills) {
         const existingBill = await tx.bill.findUnique({
           where: { billCode: bill.billCode },
         });

         await tx.bill.upsert({
           where: { billCode: bill.billCode },
           update: {
             title: bill.title,
             status: bill.status,
             house: bill.house,
             submittedAt: bill.submittedAt,
             passedAt: bill.passedAt,
             enactedAt: bill.enactedAt,
             rawSource: bill.rawSource,
           },
           create: {
             billCode: bill.billCode,
             title: bill.title,
             summary: bill.summary,
             status: bill.status,
             house: bill.house,
             submittedAt: bill.submittedAt,
             passedAt: bill.passedAt,
             enactedAt: bill.enactedAt,
             rawSource: bill.rawSource,
           },
         });

         if (existingBill) {
           updated++;
         } else {
           created++;
         }
       }

       return { deletedBillMeetings, deletedBills, created, updated };
     },
     { timeout: 60000 }, // 60秒タイムアウト（法案数が多いため余裕を持つ）
   );

   // ── 結果サマリ ──
   console.log("");
   console.log("✅ 完了!");
   if (args.cleanSeed) {
     console.log(`   🗑 削除 - BillMeeting: ${result.deletedBillMeetings} 件, Bill: ${result.deletedBills} 件`);
   }
   console.log(`   📥 新規作成: ${result.created} 件`);
   console.log(`   📝 更新: ${result.updated} 件`);
   console.log(`   📊 合計: ${result.created + result.updated} 件`);
 }

 // ──────────────────────────────────────────
 // 実行
 // ──────────────────────────────────────────

 main()
   .catch((e) => {
     console.error("❌ エラー:", e);
     process.exit(1);
   })
   .finally(() => prisma.$disconnect());
