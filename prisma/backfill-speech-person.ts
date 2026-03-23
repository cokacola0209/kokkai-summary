/**
 * Speech → Person バックフィルスクリプト
 *
 * 既存の Speech.speaker から Person を自動生成し、
 * Speech.personId を埋める。
 *
 * 使い方:
 *   npx tsx prisma/backfill-speech-person.ts
 *
 * 処理の流れ:
 * 1. 全 Speech から speaker 名を収集・正規化
 * 2. 有効な人名だけを Person テーブルに upsert
 * 3. Speech.personId を紐づけ
 * 4. Person.partyId を最頻出の Speech.partyId から補助的に設定
 *
 * - speaker / speakerGroup の raw 値は変更しない
 * - すでに personId が入っている行はスキップ
 */

 import { PrismaClient } from "@prisma/client";
 import { normalizeSpeakerName, isValidPersonName } from "../src/lib/person-utils";

 const prisma = new PrismaClient();

 async function main() {
   console.log("=== Speech → Person バックフィル ===\n");

   // personId が未設定の Speech を取得
   const speeches = await prisma.speech.findMany({
     where: { personId: null },
     select: {
       id: true,
       speaker: true,
       speakerGroup: true,
       partyId: true,
     },
   });

   console.log(`  personId 未設定の Speech: ${speeches.length} 件\n`);

   if (speeches.length === 0) {
     console.log("  すべての Speech に personId が設定済みです。\n");
     return;
   }

   // ── Step 1: speaker 名を収集・正規化 ──
   // normalizedName → { rawVariants, speechIds, partyIds }
   const personMap = new Map<
     string,
     {
       rawVariants: Set<string>;
       speechIds: string[];
       partyIds: string[];
     }
   >();

   let skipped = 0;

   for (const speech of speeches) {
     const normalized = normalizeSpeakerName(speech.speaker);

     if (!isValidPersonName(normalized)) {
       skipped++;
       continue;
     }

     if (!personMap.has(normalized)) {
       personMap.set(normalized, {
         rawVariants: new Set(),
         speechIds: [],
         partyIds: [],
       });
     }

     const entry = personMap.get(normalized)!;
     entry.rawVariants.add(speech.speaker);
     entry.speechIds.push(speech.id);
     if (speech.partyId) {
       entry.partyIds.push(speech.partyId);
     }
   }

   console.log(`  人名候補: ${personMap.size} 名（スキップ: ${skipped} 件）\n`);

   // ── Step 2: Person テーブルに upsert ──
   console.log("  Person を登録中...\n");

   const personNameToId = new Map<string, string>();
   let created = 0;
   let existing = 0;

   for (const [name, entry] of personMap) {
     const aliases = Array.from(entry.rawVariants).filter((v) => v !== name);

     // 最頻出の partyId を補助情報として設定
     let primaryPartyId: string | null = null;
     if (entry.partyIds.length > 0) {
       const partyCounts = new Map<string, number>();
       for (const pid of entry.partyIds) {
         partyCounts.set(pid, (partyCounts.get(pid) ?? 0) + 1);
       }
       primaryPartyId = Array.from(partyCounts.entries()).sort(
         (a, b) => b[1] - a[1]
       )[0][0];
     }

     const person = await prisma.person.upsert({
       where: { name },
       update: {
         // aliases は既存のものとマージ
         aliases: {
           set: aliases,
         },
         partyId: primaryPartyId,
       },
       create: {
         name,
         aliases,
         partyId: primaryPartyId,
       },
     });

     personNameToId.set(name, person.id);

     if (person.createdAt.getTime() > Date.now() - 5000) {
       created++;
     } else {
       existing++;
     }
   }

   console.log(`  新規作成: ${created} 名 / 既存更新: ${existing} 名\n`);

   // ── Step 3: Speech.personId を更新 ──
   console.log("  Speech.personId を更新中...\n");

   const BATCH_SIZE = 100;
   const updates: Array<{ id: string; personId: string }> = [];

   for (const [name, entry] of personMap) {
     const personId = personNameToId.get(name);
     if (!personId) continue;

     for (const speechId of entry.speechIds) {
       updates.push({ id: speechId, personId });
     }
   }

   for (let i = 0; i < updates.length; i += BATCH_SIZE) {
     const batch = updates.slice(i, i + BATCH_SIZE);

     await prisma.$transaction(
       batch.map((u) =>
         prisma.speech.update({
           where: { id: u.id },
           data: { personId: u.personId },
         })
       )
     );

     const progress = Math.min(i + BATCH_SIZE, updates.length);
     process.stdout.write(`\r  更新済み: ${progress} / ${updates.length}`);
   }

   console.log("\n");

   // ── 結果サマリ ──
   const totalLinked = updates.length;
   const totalPersons = personNameToId.size;

   console.log(`  ── 結果 ──`);
   console.log(`  Person 登録数: ${totalPersons} 名`);
   console.log(`  Speech 紐づけ: ${totalLinked} 件`);
   console.log(`  スキップ（非人名）: ${skipped} 件`);

   console.log("\n=== 完了 ===");
 }

 main()
   .catch((e) => {
     console.error(e);
     process.exit(1);
   })
   .finally(() => prisma.$disconnect());
