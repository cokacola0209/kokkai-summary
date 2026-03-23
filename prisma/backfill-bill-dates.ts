/**
 * 法案日付補強スクリプト
 *
 * DB 上の Bill レコードに対して、keika（経過情報）HTML から
 * submittedAt / passedAt / enactedAt を抽出し update する。
 *
 * 対象: 衆法・閣法のみ（参法・予算・条約・承認は keika 構造未確認のためスキップ）
 *
 * 使い方:
 *   npx tsx prisma/backfill-bill-dates.ts --keika-dir ./data/keika
 *   npx tsx prisma/backfill-bill-dates.ts --keika-dir ./data/keika --dry-run
 *
 * 事前準備:
 *   衆議院の経過情報ページを保存し、keika-dir に配置する。
 *   ファイル名は keikaPath のファイル名部分と一致させる。
 *   例: rawSource.keikaPath = "./keika/1DDE0CA.htm"
 *       → data/keika/1DDE0CA.htm として保存
 */

 import * as fs from "fs";
 import * as path from "path";
 import { PrismaClient } from "@prisma/client";
 import { parseDatesFromKeikaHtml } from "../src/lib/bill-fetcher";

 const prisma = new PrismaClient();

 // ──────────────────────────────────────────
 // 対象判定
 // ──────────────────────────────────────────

 /** 衆法・閣法・参法を対象。予算・条約・承認はスキップ */
 const SUPPORTED_TYPES = ["衆法", "閣法", "参法"];

 function getBillType(billCode: string): string {
   // billCode 例: "217-閣法-1" → "閣法"
   const parts = billCode.split("-");
   return parts.length >= 2 ? parts[1] : "";
 }

 // ──────────────────────────────────────────
 // CLI 引数パース
 // ──────────────────────────────────────────

 interface CliArgs {
   keikaDir: string;
   dryRun: boolean;
 }

 function parseArgs(): CliArgs {
   const args = process.argv.slice(2);
   const result: CliArgs = { keikaDir: "", dryRun: false };

   for (let i = 0; i < args.length; i++) {
     switch (args[i]) {
       case "--keika-dir":
         i++;
         if (i < args.length) result.keikaDir = args[i];
         break;
       case "--dry-run":
         result.dryRun = true;
         break;
     }
   }
   return result;
 }

 // ──────────────────────────────────────────
 // rawSource から keikaPath のファイル名を取得
 // ──────────────────────────────────────────

 function getKeikaFileName(rawSource: string): string | null {
   if (!rawSource) return null;
   try {
     const parsed = JSON.parse(rawSource);
     const keikaPath = parsed.keikaPath; // 例: "./keika/1DDE0CA.htm"
     if (!keikaPath) return null;
     return path.basename(keikaPath); // "1DDE0CA.htm"
   } catch {
     return null;
   }
 }

 // ──────────────────────────────────────────
 // メイン処理
 // ──────────────────────────────────────────

 async function main() {
   const args = parseArgs();

   if (!args.keikaDir) {
     console.error("❌ --keika-dir が指定されていません。");
     console.error("");
     console.error("使い方:");
     console.error("  npx tsx prisma/backfill-bill-dates.ts --keika-dir ./data/keika");
     console.error("  npx tsx prisma/backfill-bill-dates.ts --keika-dir ./data/keika --dry-run");
     console.error("");
     console.error("keika HTML ファイルの保存方法:");
     console.error("  各法案の経過情報ページを、keikaPath のファイル名で保存してください。");
     console.error("  例: ./data/keika/1DDE0CA.htm");
     process.exit(1);
   }

   if (!fs.existsSync(args.keikaDir)) {
     console.error(`❌ ディレクトリが見つかりません: ${args.keikaDir}`);
     process.exit(1);
   }

   // keika ディレクトリ内のファイル一覧を取得
   const keikaFiles = new Set(
     fs.readdirSync(args.keikaDir).filter((f) => f.endsWith(".htm") || f.endsWith(".html")),
   );

   console.log("📅 法案日付補強を開始します");
   console.log(`  keika-dir: ${args.keikaDir} (${keikaFiles.size} ファイル)`);
   console.log(`  dry-run: ${args.dryRun ? "YES" : "NO"}`);
   console.log("");

   // DB から全 Bill を取得
   const bills = await prisma.bill.findMany({
     select: {
       id: true,
       billCode: true,
       rawSource: true,
       submittedAt: true,
       passedAt: true,
       enactedAt: true,
     },
   });

   console.log(`📊 DB 上の法案: ${bills.length} 件`);

   // 集計
   let skippedType = 0;
   let skippedNoKeika = 0;
   let skippedNoFile = 0;
   let processed = 0;
   let updatedSubmitted = 0;
   let updatedPassed = 0;
   let updatedEnacted = 0;
   let unchanged = 0;

   for (const bill of bills) {
     const billType = getBillType(bill.billCode);

     // 対象外の法案種別をスキップ
     if (!SUPPORTED_TYPES.includes(billType)) {
       skippedType++;
       continue;
     }

     // rawSource から keika ファイル名を取得
     const keikaFileName = getKeikaFileName(bill.rawSource);
     if (!keikaFileName) {
       skippedNoKeika++;
       continue;
     }

     // keika ファイルが存在するか
     // .htm と .html の両方を試す
     let actualFileName = "";
     if (keikaFiles.has(keikaFileName)) {
       actualFileName = keikaFileName;
     } else {
       // .htm → .html の変換を試す
       const altName = keikaFileName.replace(/\.htm$/, ".html");
       if (keikaFiles.has(altName)) {
         actualFileName = altName;
       }
     }

     if (!actualFileName) {
       skippedNoFile++;
       continue;
     }

     // keika HTML を読み込んでパース
     // 手動保存(UTF-8) と自動取得(Shift_JIS) が混在するため両方試す
     const keikaPath = path.join(args.keikaDir, actualFileName);
     const raw = fs.readFileSync(keikaPath);
     const html = decodeKeikaHtml(raw);
     const dates = parseDatesFromKeikaHtml(html, billType);

     // 更新が必要なフィールドだけ集める（既に値がある場合は上書きしない）
     const updates: Record<string, Date> = {};
     let thisUpdated = false;

     if (dates.submittedAt && !bill.submittedAt) {
       updates.submittedAt = dates.submittedAt;
       updatedSubmitted++;
       thisUpdated = true;
     }
     if (dates.passedAt && !bill.passedAt) {
       updates.passedAt = dates.passedAt;
       updatedPassed++;
       thisUpdated = true;
     }
     if (dates.enactedAt && !bill.enactedAt) {
       updates.enactedAt = dates.enactedAt;
       updatedEnacted++;
       thisUpdated = true;
     }

     if (!thisUpdated) {
       unchanged++;
       processed++;
       continue;
     }

     // dry-run ならログだけ
     if (args.dryRun) {
       const parts: string[] = [];
       if (updates.submittedAt) parts.push(`提出=${fmt(updates.submittedAt)}`);
       if (updates.passedAt) parts.push(`通過=${fmt(updates.passedAt)}`);
       if (updates.enactedAt) parts.push(`成立=${fmt(updates.enactedAt)}`);
       console.log(`  📅 ${bill.billCode}: ${parts.join(", ")}`);
     } else {
       await prisma.bill.update({
         where: { id: bill.id },
         data: updates,
       });
     }

     processed++;
   }

   // ── サマリ ──
   console.log("");
   console.log(args.dryRun ? "🔍 dry-run 結果:" : "✅ 完了!");
   console.log(`  処理対象: ${processed} 件`);
   console.log(`  submittedAt 補強: ${updatedSubmitted} 件`);
   console.log(`  passedAt 補強:    ${updatedPassed} 件`);
   console.log(`  enactedAt 補強:   ${updatedEnacted} 件`);
   console.log(`  変更なし: ${unchanged} 件`);
   console.log(`  スキップ（参法等）: ${skippedType} 件`);
   console.log(`  スキップ（keika情報なし）: ${skippedNoKeika} 件`);
   console.log(`  スキップ（ファイル未保存）: ${skippedNoFile} 件`);
 }

 /** Date を YYYY-MM-DD 形式に整形 */
 function fmt(d: Date): string {
   return d.toISOString().slice(0, 10);
 }

 /**
  * keika HTML のバイト列をデコードする。
  * 手動保存（UTF-8）と自動取得（Shift_JIS）が混在するため、
  * まず UTF-8 で試し、日本語が含まれなければ Shift_JIS で再デコード。
  */
 function decodeKeikaHtml(raw: Buffer): string {
   const utf8 = new TextDecoder("utf-8").decode(raw);
   // UTF-8 で正しく読めていれば「議案」等の日本語が含まれるはず
   if (utf8.includes("議案")) return utf8;
   // Shift_JIS で再デコード
   return new TextDecoder("shift_jis").decode(raw);
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
