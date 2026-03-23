/**
 * Person データクリーンアップスクリプト
 *
 * DB 上の Person レコードを共通バリデーションで検査し、
 * 無効な名前の Person を削除（紐づく Speech.personId は null に戻す）。
 *
 * 使い方:
 *   npx tsx prisma/cleanup-persons.ts --dry-run
 *   npx tsx prisma/cleanup-persons.ts
 *
 * 処理:
 * 1. 全 Person を取得
 * 2. isValidPersonName で検査
 * 3. 無効な Person に紐づく Speech.personId を null に戻す
 * 4. 無効な Person を削除
 */

 import { PrismaClient } from "@prisma/client";
 import { normalizeSpeakerName, isValidPersonName } from "../src/lib/person-utils";

 const prisma = new PrismaClient();

 function parseArgs() {
   const args = process.argv.slice(2);
   return { dryRun: args.includes("--dry-run") };
 }

 async function main() {
   const { dryRun } = parseArgs();

   console.log("🧹 Person データクリーンアップ");
   console.log(`  dry-run: ${dryRun ? "YES" : "NO"}`);
   console.log("");

   // 全 Person を取得
   const persons = await prisma.person.findMany({
     include: {
       _count: { select: { speeches: true } },
     },
   });

   console.log(`📊 Person 総数: ${persons.length} 件`);

   // 無効な Person を検出
   const invalid: Array<{ id: string; name: string; speechCount: number }> = [];
   let valid = 0;

   for (const p of persons) {
     // Person.name を再正規化してチェック
     const normalized = normalizeSpeakerName(p.name);
     if (!isValidPersonName(normalized) || !isValidPersonName(p.name)) {
       invalid.push({
         id: p.id,
         name: p.name,
         speechCount: p._count.speeches,
       });
     } else {
       valid++;
     }
   }

   console.log(`  ✅ 有効: ${valid} 件`);
   console.log(`  ❌ 無効: ${invalid.length} 件`);
   console.log("");

   if (invalid.length === 0) {
     console.log("✅ 無効な Person はありません。");
     return;
   }

   // 無効な Person を表示
   console.log("❌ 削除対象:");
   for (const p of invalid) {
     console.log(`  「${p.name}」 (Speech ${p.speechCount} 件紐づき)`);
   }
   console.log("");

   if (dryRun) {
     console.log("🔍 dry-run: 削除は実行しません。");
     const totalSpeeches = invalid.reduce((sum, p) => sum + p.speechCount, 0);
     console.log(`  削除予定 Person: ${invalid.length} 件`);
     console.log(`  personId を null に戻す Speech: ${totalSpeeches} 件`);
     return;
   }

   // ── 実行: トランザクションで削除 ──
   const invalidIds = invalid.map((p) => p.id);

   await prisma.$transaction(async (tx) => {
     // Speech.personId を null に戻す
     const speechResult = await tx.speech.updateMany({
       where: { personId: { in: invalidIds } },
       data: { personId: null },
     });
     console.log(`  Speech.personId を null に戻し: ${speechResult.count} 件`);

     // Person を削除
     const personResult = await tx.person.deleteMany({
       where: { id: { in: invalidIds } },
     });
     console.log(`  Person 削除: ${personResult.count} 件`);
   });

   console.log("");
   console.log("✅ クリーンアップ完了!");
   console.log("");
   console.log("次のステップ:");
   console.log("  backfill を再実行して正しい personId を再紐付けしてください:");
   console.log("  npx tsx prisma/backfill-speech-person.ts");
 }

 main()
   .catch((e) => {
     console.error("❌ エラー:", e);
     process.exit(1);
   })
   .finally(() => prisma.$disconnect());
