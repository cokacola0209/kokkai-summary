/**
 * 法案 summary AI生成スクリプト
 *
 * summary が空の法案に対して、タイトルと keika 情報を元に
 * Claude API で1〜2文の平易な要約を生成し、DB に保存する。
 *
 * 使い方:
 *   npx tsx prisma/generate-bill-summaries.ts --keika-dir ./data/keika --dry-run
 *   npx tsx prisma/generate-bill-summaries.ts --keika-dir ./data/keika
 *   npx tsx prisma/generate-bill-summaries.ts --keika-dir ./data/keika --limit 10
 *
 * オプション:
 *   --keika-dir <path>  keika HTML ディレクトリ（省略時はタイトルのみで生成）
 *   --dry-run           API 呼び出しせず、プロンプト例を表示
 *   --limit <n>         処理件数の上限
 *   --delay <ms>        API 呼び出し間隔ミリ秒（デフォルト: 1500）
 *   --force             既に summary がある法案も上書き
 *
 * 必要な環境変数:
 *   ANTHROPIC_API_KEY   Anthropic API キー（.env に設定）
 */

 import * as fs from "fs";
 import * as path from "path";
 import { PrismaClient } from "@prisma/client";
 import Anthropic from "@anthropic-ai/sdk";

 const prisma = new PrismaClient();

 // ──────────────────────────────────────────
 // CLI 引数
 // ──────────────────────────────────────────

 interface CliArgs {
   keikaDir: string;
   dryRun: boolean;
   limit: number;
   delayMs: number;
   force: boolean;
 }

 function parseArgs(): CliArgs {
   const args = process.argv.slice(2);
   const result: CliArgs = {
     keikaDir: "",
     dryRun: false,
     limit: Infinity,
     delayMs: 1500,
     force: false,
   };

   for (let i = 0; i < args.length; i++) {
     switch (args[i]) {
       case "--keika-dir":
         i++;
         if (i < args.length) result.keikaDir = args[i];
         break;
       case "--dry-run":
         result.dryRun = true;
         break;
       case "--limit":
         i++;
         if (i < args.length) result.limit = parseInt(args[i], 10) || Infinity;
         break;
       case "--delay":
         i++;
         if (i < args.length) result.delayMs = parseInt(args[i], 10) || 1500;
         break;
       case "--force":
         result.force = true;
         break;
     }
   }
   return result;
 }

 // ──────────────────────────────────────────
 // keika HTML から補助情報を抽出
 // ──────────────────────────────────────────

 interface KeikaContext {
   submitter: string;     // 議案提出者
   committee: string;     // 付託委員会
   result: string;        // 審議結果
 }

 /** keika HTML から要約に使う補助情報を抽出 */
 function extractKeikaContext(html: string): KeikaContext {
   const ctx: KeikaContext = { submitter: "", committee: "", result: "" };

   const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
   let match: RegExpExecArray | null;

   while ((match = rowRegex.exec(html)) !== null) {
     const cellRegex = /<t[dh][^>]*>(.*?)<\/t[dh]>/gis;
     const cells: string[] = [];
     let cellMatch: RegExpExecArray | null;
     while ((cellMatch = cellRegex.exec(match[1])) !== null) {
       cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
     }
     if (cells.length < 2) continue;

     const key = cells[0].replace(/[\s\u3000]+/g, "");
     const val = cells[1].trim();

     if (key === "議案提出者" && val) {
       ctx.submitter = val;
     }
     // 衆議院付託委員会 or 参議院付託委員会
     if (key.includes("付託年月日") && key.includes("付託委員会")) {
       const parts = val.split("／");
       const comm = (parts[1] ?? "").trim();
       if (comm && !ctx.committee) {
         ctx.committee = comm;
       }
     }
     // 審議結果（衆議院 or 参議院）
     if (key.includes("審議終了年月日") && key.includes("審議結果")) {
       const parts = val.split("／");
       const res = (parts[1] ?? "").trim();
       if (res && res !== "") {
         ctx.result = res;
       }
     }
   }

   return ctx;
 }

 // ──────────────────────────────────────────
 // rawSource から keika ファイル名を取得
 // ──────────────────────────────────────────

 function getKeikaFileName(rawSource: string): string | null {
   if (!rawSource) return null;
   try {
     const parsed = JSON.parse(rawSource);
     const kp: string = parsed.keikaPath ?? "";
     if (!kp) return null;
     return path.basename(kp);
   } catch {
     return null;
   }
 }

 // ──────────────────────────────────────────
 // keika HTML 読み込み（UTF-8 / Shift_JIS 両対応）
 // ──────────────────────────────────────────

 function readKeikaHtml(filePath: string): string {
   const raw = fs.readFileSync(filePath);
   // UTF-8 で読んでみて、文字化けしていなければそのまま使う
   const utf8 = raw.toString("utf-8");
   if (utf8.includes("議案") || utf8.includes("審議")) {
     return utf8;
   }
   // Shift_JIS として再デコード
   const decoder = new TextDecoder("shift-jis");
   return decoder.decode(raw);
 }

 // ──────────────────────────────────────────
 // プロンプト構築
 // ──────────────────────────────────────────

 function buildPrompt(title: string, billCode: string, ctx: KeikaContext | null): string {
   let context = "";
   if (ctx) {
     if (ctx.submitter) context += `\n- 提出者: ${ctx.submitter}`;
     if (ctx.committee) context += `\n- 審査委員会: ${ctx.committee}`;
     if (ctx.result) context += `\n- 審議結果: ${ctx.result}`;
   }

   return `あなたは政治に詳しくない若い人向けに法案の内容を説明するライターです。

 以下の法案について、1〜2文（80文字以内）で「この法案は何をするためのものか」をわかりやすく説明してください。

 ルール:
 - 専門用語は避け、中学生でもわかる表現を使う
 - 「〜する法案です。」のように簡潔に終える
 - 法案名をそのまま繰り返さない
 - 政治的な評価や意見は含めない
 - 事実ベースで説明する

 法案名: ${title}
 法案番号: ${billCode}${context}

 説明:`;
 }

 // ──────────────────────────────────────────
 // メイン処理
 // ──────────────────────────────────────────

 function sleep(ms: number): Promise<void> {
   return new Promise((resolve) => setTimeout(resolve, ms));
 }

 async function main() {
   const args = parseArgs();

   // API キー確認（dry-run 以外）
   if (!args.dryRun && !process.env.ANTHROPIC_API_KEY) {
     console.error("❌ ANTHROPIC_API_KEY が設定されていません。");
     console.error("   .env に ANTHROPIC_API_KEY=sk-ant-... を追加してください。");
     process.exit(1);
   }

   console.log("🤖 法案 summary AI生成を開始します");
   console.log(`  keika-dir: ${args.keikaDir || "(なし・タイトルのみで生成)"}`);
   console.log(`  dry-run: ${args.dryRun ? "YES" : "NO"}`);
   console.log(`  limit: ${args.limit === Infinity ? "なし" : args.limit}`);
   console.log(`  delay: ${args.delayMs}ms`);
   console.log(`  force: ${args.force ? "YES（上書き）" : "NO（空のみ）"}`);
   console.log("");

   // keika ファイル一覧
   const keikaFiles = new Set<string>();
   if (args.keikaDir && fs.existsSync(args.keikaDir)) {
     for (const f of fs.readdirSync(args.keikaDir)) {
       keikaFiles.add(f);
     }
   }

   // 対象の法案を取得
   const whereClause = args.force ? {} : { summary: "" };
   const bills = await prisma.bill.findMany({
     where: whereClause,
     select: {
       id: true,
       billCode: true,
       title: true,
       summary: true,
       rawSource: true,
     },
     orderBy: { billCode: "asc" },
   });

   const targets = bills.slice(0, args.limit);

   console.log(`📊 対象法案: ${targets.length} 件（DB全体: ${bills.length} 件）`);
   if (keikaFiles.size > 0) {
     console.log(`📁 keika ファイル: ${keikaFiles.size} 件`);
   }
   console.log("");

   if (targets.length === 0) {
     console.log("✅ 生成対象がありません。");
     return;
   }

   // Anthropic クライアント
   const client = args.dryRun ? null : new Anthropic();

   let generated = 0;
   let skipped = 0;
   let failed = 0;

   for (let i = 0; i < targets.length; i++) {
     const bill = targets[i];
     const progress = `[${i + 1}/${targets.length}]`;

     // keika から補助情報を取得（あれば）
     let ctx: KeikaContext | null = null;
     const keikaFileName = getKeikaFileName(bill.rawSource);
     if (keikaFileName && args.keikaDir) {
       // .htm と .html の両方を試す
       const tryNames = [keikaFileName, keikaFileName.replace(/\.htm$/, ".html")];
       for (const name of tryNames) {
         if (keikaFiles.has(name)) {
           const html = readKeikaHtml(path.join(args.keikaDir, name));
           ctx = extractKeikaContext(html);
           break;
         }
       }
     }

     const prompt = buildPrompt(bill.title, bill.billCode, ctx);

     // dry-run
     if (args.dryRun) {
       if (i < 3) {
         console.log(`${progress} ${bill.billCode}: ${bill.title.slice(0, 40)}`);
         console.log(`  提出者: ${ctx?.submitter || "(なし)"}`);
         console.log(`  委員会: ${ctx?.committee || "(なし)"}`);
         console.log(`  結果: ${ctx?.result || "(なし)"}`);
         console.log("");
       }
       generated++;
       continue;
     }

     // Claude API 呼び出し
     try {
       const response = await client!.messages.create({
         model: "claude-sonnet-4-20250514",
         max_tokens: 200,
         messages: [{ role: "user", content: prompt }],
       });

       const text = response.content
         .filter((block): block is Anthropic.TextBlock => block.type === "text")
         .map((block) => block.text)
         .join("")
         .trim();

       if (!text) {
         console.error(`  ❌ ${progress} ${bill.billCode}: 空のレスポンス`);
         failed++;
         await sleep(args.delayMs);
         continue;
       }

       // DB 更新
       await prisma.bill.update({
         where: { id: bill.id },
         data: { summary: text },
       });

       generated++;

       if (generated % 10 === 0 || i === targets.length - 1) {
         console.log(`  ✍️ ${progress} ${bill.billCode}: ${text.slice(0, 50)}...`);
       }
     } catch (err) {
       const msg = err instanceof Error ? err.message : String(err);
       console.error(`  ❌ ${progress} ${bill.billCode}: ${msg}`);
       failed++;
     }

     // 最後の1件以外は待機
     if (i < targets.length - 1) {
       await sleep(args.delayMs);
     }
   }

   // サマリ
   console.log("");
   console.log(args.dryRun ? "🔍 dry-run 結果:" : "✅ 完了!");
   console.log(`  生成: ${generated} 件`);
   console.log(`  スキップ: ${skipped} 件`);
   console.log(`  失敗: ${failed} 件`);

   if (!args.dryRun && generated > 0) {
     console.log("");
     console.log(`⏱ 合計API呼び出し: ${generated} 回`);
   }
 }

 main()
   .catch((e) => {
     console.error("❌ エラー:", e);
     process.exit(1);
   })
   .finally(() => prisma.$disconnect());
