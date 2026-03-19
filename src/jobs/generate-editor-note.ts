/**
 * 管理者まとめ（AI下書き）を生成する
 *
 * 使い方:
 *   npx tsx src/jobs/generate-editor-note.ts
 *   npx tsx src/jobs/generate-editor-note.ts --date 2025-06-05
 */

 import { generateDailyEditorNote } from "../lib/editor-note/generateDailyEditorNote";

 async function main() {
   const dateArg = process.argv.find((a) => a.startsWith("--date"))
     ? process.argv[process.argv.indexOf("--date") + 1]
     : null;

   const targetDate = dateArg ? new Date(dateArg) : undefined;

   console.log(
     `[GenerateEditorNote] 対象日: ${
       targetDate ? targetDate.toISOString().slice(0, 10) : "最新"
     }`
   );

   const result = await generateDailyEditorNote(targetDate);

   if (result) {
     console.log(`\n=== 生成結果 ===`);
     console.log(`タイトル: ${result.title}`);
     console.log(`冒頭: ${result.introText}`);
     console.log(`本文: ${result.editedText}`);
     console.log(`ステータス: ${result.status}`);
     console.log(`================\n`);
   } else {
     console.log("会議データなし、生成スキップ");
   }

   process.exit(0);
 }

 main().catch((e) => {
   console.error(e);
   process.exit(1);
 });
