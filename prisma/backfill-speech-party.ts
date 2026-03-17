/**
 * Speech → Party バックフィルスクリプト
 *
 * 既存の Speech.speakerGroup を Party.name と照合し、
 * Speech.partyId を埋める。
 *
 * 使い方:
 *   npx tsx prisma/backfill-speech-party.ts
 *
 * - speaker / speakerGroup の raw 値は変更しない
 * - すでに partyId が入っている行はスキップ
 * - マッチしなかった speakerGroup はログに出力
 */

 import { PrismaClient } from "@prisma/client";

 const prisma = new PrismaClient();

 /**
  * speakerGroup の文字列から Party を特定するためのマッピング
  * キー: speakerGroup に含まれるキーワード（前方一致 or 部分一致）
  * バリュー: Party.name
  *
  * 順番が重要: より長い（具体的な）キーワードを先に書く
  */
 const SPEAKER_GROUP_TO_PARTY: Array<{ pattern: string; partyName: string }> = [
   // ── 衆議院会派 ──
   { pattern: "自由民主党・無所属の会",           partyName: "自由民主党・無所属の会" },
   { pattern: "立憲民主党・無所属",               partyName: "立憲民主党・無所属" },
   { pattern: "日本維新の会・教育無償化を実現する会", partyName: "日本維新の会・教育無償化を実現する会" },
   { pattern: "国民民主党・無所属クラブ",         partyName: "国民民主党・無所属クラブ" },

   // ── 参議院会派 ──
   { pattern: "立憲民主・社民・無所属",           partyName: "立憲民主・社民・無所属" },
   { pattern: "立憲民主・社民",                   partyName: "立憲民主・社民・無所属" },
   { pattern: "国民民主党・新緑風会",             partyName: "国民民主党・新緑風会" },

   // ── 共通（衆参で同じ名前を使う会派） ──
   { pattern: "公明党",                           partyName: "公明党" },
   { pattern: "日本共産党",                       partyName: "日本共産党" },
   { pattern: "れいわ新選組",                     partyName: "れいわ新選組" },
   { pattern: "有志の会",                         partyName: "有志の会" },
   { pattern: "参政党",                           partyName: "参政党" },

   // ── 短い名前のフォールバック（上のどれにもマッチしなかった場合） ──
   { pattern: "日本維新の会",                     partyName: "日本維新の会" },
   { pattern: "国民民主党",                       partyName: "国民民主党・無所属クラブ" },
   { pattern: "自由民主党",                       partyName: "自由民主党" },
   { pattern: "立憲民主党",                       partyName: "立憲民主党・無所属" },
   { pattern: "無所属",                           partyName: "無所属" },
 ];

 async function main() {
   console.log("=== Speech → Party バックフィル ===\n");

   // Party テーブルから name → id のマップを作成
   const parties = await prisma.party.findMany();
   const partyNameToId = new Map(parties.map((p) => [p.name, p.id]));

   console.log(`  Party テーブル: ${parties.length} 件\n`);

   // partyId が未設定の Speech を取得
   const speeches = await prisma.speech.findMany({
     where: { partyId: null },
     select: {
       id: true,
       speakerGroup: true,
     },
   });

   console.log(`  partyId 未設定の Speech: ${speeches.length} 件\n`);

   if (speeches.length === 0) {
     console.log("  すべての Speech に partyId が設定済みです。\n");
     return;
   }

   let matched = 0;
   let unmatched = 0;
   const unmatchedGroups = new Map<string, number>();

   // バッチ更新用（100件ずつ）
   const BATCH_SIZE = 100;
   const updates: Array<{ id: string; partyId: string }> = [];

   for (const speech of speeches) {
     const group = speech.speakerGroup?.trim();

     if (!group) {
       unmatched++;
       unmatchedGroups.set("(空)", (unmatchedGroups.get("(空)") ?? 0) + 1);
       continue;
     }

     // パターンマッチング
     let foundPartyId: string | null = null;

     for (const mapping of SPEAKER_GROUP_TO_PARTY) {
       if (group.includes(mapping.pattern)) {
         foundPartyId = partyNameToId.get(mapping.partyName) ?? null;
         break;
       }
     }

     if (foundPartyId) {
       updates.push({ id: speech.id, partyId: foundPartyId });
       matched++;
     } else {
       unmatched++;
       unmatchedGroups.set(group, (unmatchedGroups.get(group) ?? 0) + 1);
     }
   }

   // バッチ更新実行
   console.log(`  マッチ: ${matched} 件 / 未マッチ: ${unmatched} 件\n`);
   console.log(`  更新を実行中...\n`);

   for (let i = 0; i < updates.length; i += BATCH_SIZE) {
     const batch = updates.slice(i, i + BATCH_SIZE);

     await prisma.$transaction(
       batch.map((u) =>
         prisma.speech.update({
           where: { id: u.id },
           data: { partyId: u.partyId },
         })
       )
     );

     const progress = Math.min(i + BATCH_SIZE, updates.length);
     process.stdout.write(`\r  更新済み: ${progress} / ${updates.length}`);
   }

   console.log("\n");

   // 未マッチの speakerGroup を表示
   if (unmatchedGroups.size > 0) {
     console.log("  ── 未マッチの speakerGroup ──");
     const sorted = Array.from(unmatchedGroups.entries()).sort(
       (a, b) => b[1] - a[1]
     );
     for (const [group, count] of sorted) {
       console.log(`    ${count}件: "${group}"`);
     }
     console.log(
       "\n  ↑ 必要に応じて SPEAKER_GROUP_TO_PARTY にマッピングを追加してください。"
     );
   }

   console.log("\n=== 完了 ===");
 }

 main()
   .catch((e) => {
     console.error(e);
     process.exit(1);
   })
   .finally(() => prisma.$disconnect());
