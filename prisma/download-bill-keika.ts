/**
 * keika HTML 一括ダウンロードスクリプト
 *
 * DB 上の Bill レコードの rawSource.keikaPath を使い、
 * 衆議院サイトから経過情報ページを取得して data/keika/ に保存する。
 *
 * 使い方:
 *   npx tsx prisma/download-bill-keika.ts --dry-run
 *   npx tsx prisma/download-bill-keika.ts
 *   npx tsx prisma/download-bill-keika.ts --out-dir ./data/keika --delay 1500
 *
 * オプション:
 *   --dry-run           保存せず対象件数だけ表示
 *   --out-dir <path>    保存先ディレクトリ（デフォルト: ./data/keika）
 *   --delay <ms>        リクエスト間隔ミリ秒（デフォルト: 1000）
 *   --force             既存ファイルを上書き
 */

 import * as fs from "fs";
 import * as path from "path";
 import { PrismaClient } from "@prisma/client";

 const prisma = new PrismaClient();

 // ──────────────────────────────────────────
 // 定数
 // ──────────────────────────────────────────

 const BASE_URL = "https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian";
 const SUPPORTED_TYPES = ["衆法", "閣法", "参法"];
 const DEFAULT_OUT_DIR = "./data/keika";
 const DEFAULT_DELAY_MS = 1000;

 // ──────────────────────────────────────────
 // CLI 引数パース
 // ──────────────────────────────────────────

 interface CliArgs {
   outDir: string;
   dryRun: boolean;
   delayMs: number;
   force: boolean;
 }

 function parseArgs(): CliArgs {
   const args = process.argv.slice(2);
   const result: CliArgs = {
     outDir: DEFAULT_OUT_DIR,
     dryRun: false,
     delayMs: DEFAULT_DELAY_MS,
     force: false,
   };

   for (let i = 0; i < args.length; i++) {
     switch (args[i]) {
       case "--out-dir":
         i++;
         if (i < args.length) result.outDir = args[i];
         break;
       case "--dry-run":
         result.dryRun = true;
         break;
       case "--delay":
         i++;
         if (i < args.length) result.delayMs = parseInt(args[i], 10) || DEFAULT_DELAY_MS;
         break;
       case "--force":
         result.force = true;
         break;
     }
   }
   return result;
 }

 // ──────────────────────────────────────────
 // ヘルパー
 // ──────────────────────────────────────────

 function getBillType(billCode: string): string {
   const parts = billCode.split("-");
   return parts.length >= 2 ? parts[1] : "";
 }

 /** rawSource JSON から keikaPath のファイル名を取得 */
 function getKeikaFileName(rawSource: string): string | null {
   if (!rawSource) return null;
   try {
     const parsed = JSON.parse(rawSource);
     const keikaPath: string = parsed.keikaPath ?? "";
     if (!keikaPath) return null;
     return path.basename(keikaPath); // "1DDE0CA.htm"
   } catch {
     return null;
   }
 }

 /** keikaファイル名 → 完全URL */
 function buildKeikaUrl(fileName: string): string {
   return `${BASE_URL}/keika/${fileName}`;
 }

 function sleep(ms: number): Promise<void> {
   return new Promise((resolve) => setTimeout(resolve, ms));
 }

 // ──────────────────────────────────────────
 // メイン処理
 // ──────────────────────────────────────────

 async function main() {
   const args = parseArgs();

   console.log("📥 keika HTML 一括ダウンロード");
   console.log(`  保存先: ${args.outDir}`);
   console.log(`  dry-run: ${args.dryRun ? "YES" : "NO"}`);
   console.log(`  リクエスト間隔: ${args.delayMs}ms`);
   console.log(`  上書き: ${args.force ? "YES" : "NO"}`);
   console.log("");

   // 保存先ディレクトリを作成
   if (!args.dryRun) {
     fs.mkdirSync(args.outDir, { recursive: true });
   }

   // 既存ファイル一覧
   const existingFiles = new Set<string>();
   if (fs.existsSync(args.outDir)) {
     for (const f of fs.readdirSync(args.outDir)) {
       existingFiles.add(f);
     }
   }

   // DB から全 Bill を取得
   const bills = await prisma.bill.findMany({
     select: { billCode: true, rawSource: true },
     orderBy: { billCode: "asc" },
   });

   console.log(`📊 DB 上の法案: ${bills.length} 件`);
   console.log(`📁 保存済み keika: ${existingFiles.size} 件`);
   console.log("");

   // 対象を絞り込み
   interface Target {
     billCode: string;
     fileName: string;
     url: string;
   }

   const targets: Target[] = [];
   let skippedType = 0;
   let skippedNoKeika = 0;
   let skippedExists = 0;

   for (const bill of bills) {
     const billType = getBillType(bill.billCode);
     if (!SUPPORTED_TYPES.includes(billType)) {
       skippedType++;
       continue;
     }

     const fileName = getKeikaFileName(bill.rawSource);
     if (!fileName) {
       skippedNoKeika++;
       continue;
     }

     if (!args.force && existingFiles.has(fileName)) {
       skippedExists++;
       continue;
     }

     targets.push({
       billCode: bill.billCode,
       fileName,
       url: buildKeikaUrl(fileName),
     });
   }

   console.log(`🎯 ダウンロード対象: ${targets.length} 件`);
   console.log(`  スキップ（参法等）: ${skippedType} 件`);
   console.log(`  スキップ（keika情報なし）: ${skippedNoKeika} 件`);
   console.log(`  スキップ（保存済み）: ${skippedExists} 件`);
   console.log("");

   if (targets.length === 0) {
     console.log("✅ ダウンロード対象がありません。");
     return;
   }

   // dry-run ならここで終了
   if (args.dryRun) {
     console.log("🔍 dry-run: 以下がダウンロード対象です");
     for (const t of targets.slice(0, 10)) {
       console.log(`  ${t.billCode} → ${t.fileName}`);
     }
     if (targets.length > 10) {
       console.log(`  ... 他 ${targets.length - 10} 件`);
     }
     console.log("");
     console.log(`⏱ 予想所要時間: 約 ${Math.ceil((targets.length * args.delayMs) / 1000 / 60)} 分`);
     return;
   }

   // ダウンロード実行
   let downloaded = 0;
   let failed = 0;

   for (let i = 0; i < targets.length; i++) {
     const t = targets[i];
     const progress = `[${i + 1}/${targets.length}]`;

     try {
       const res = await fetch(t.url);

       if (!res.ok) {
         console.error(`  ❌ ${progress} ${t.billCode}: HTTP ${res.status}`);
         failed++;
         await sleep(args.delayMs);
         continue;
       }

       const buf = await res.arrayBuffer();
const html = new TextDecoder("shift-jis").decode(buf);

       // 簡易バリデーション: HTML っぽいか
       if (html.length < 100 || !html.includes("<")) {
         console.error(`  ❌ ${progress} ${t.billCode}: レスポンスが不正（${html.length} bytes）`);
         failed++;
         await sleep(args.delayMs);
         continue;
       }

       const outPath = path.join(args.outDir, t.fileName);
       fs.writeFileSync(outPath, html, "utf-8");
       downloaded++;

       if (downloaded % 10 === 0 || i === targets.length - 1) {
         console.log(`  📄 ${progress} ${t.billCode} → ${t.fileName} (${html.length} bytes)`);
       }
     } catch (err) {
       const msg = err instanceof Error ? err.message : String(err);
       console.error(`  ❌ ${progress} ${t.billCode}: ${msg}`);
       failed++;
     }

     // 最後の1件以外は待機
     if (i < targets.length - 1) {
       await sleep(args.delayMs);
     }
   }

   // ── サマリ ──
   console.log("");
   console.log("✅ 完了!");
   console.log(`  ダウンロード成功: ${downloaded} 件`);
   console.log(`  失敗: ${failed} 件`);
   console.log(`  保存先: ${args.outDir}`);
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
