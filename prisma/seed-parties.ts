/**
 * Party / PartySeat 初期データ投入スクリプト
 *
 * 使い方:
 *   npx tsx prisma/seed-parties.ts
 *
 * 注意:
 * - 会派名は国会会議録の speakerGroup に出てくる名称に合わせている
 * - 議席数は2025年1月時点の概数（第217回国会開会時ベース）
 * - 後から PartySeat を追加すれば時点更新可能
 */

 import { PrismaClient } from "@prisma/client";

 const prisma = new PrismaClient();

 const PARTIES = [
   // ── 衆議院の主な会派 ──
   { name: "自由民主党・無所属の会",   shortName: "自民",     color: "#c0392b" },
   { name: "立憲民主党・無所属",       shortName: "立憲",     color: "#1a5fb4" },
   { name: "日本維新の会・教育無償化を実現する会", shortName: "維新", color: "#3fa535" },
   { name: "公明党",                   shortName: "公明",     color: "#f39c12" },
   { name: "国民民主党・無所属クラブ", shortName: "国民",     color: "#e67e22" },
   { name: "日本共産党",               shortName: "共産",     color: "#e74c3c" },
   { name: "れいわ新選組",             shortName: "れいわ",   color: "#e91e63" },
   { name: "有志の会",                 shortName: "有志",     color: "#7f8c8d" },
   { name: "参政党",                   shortName: "参政",     color: "#ff8f00" },

   // ── 参議院の主な会派（衆議院と名称が異なるもの） ──
   { name: "自由民主党",               shortName: "自民(参)", color: "#c0392b" },
   { name: "立憲民主・社民・無所属",   shortName: "立憲(参)", color: "#1a5fb4" },
   { name: "日本維新の会",             shortName: "維新(参)", color: "#3fa535" },
   { name: "国民民主党・新緑風会",     shortName: "国民(参)", color: "#e67e22" },

   // ── 無所属・その他 ──
   { name: "無所属",                   shortName: "無所属",   color: "#95a5a6" },
 ];

 // 2025年1月時点の議席数（第217回国会開会時ベース、概数）
 const SEATS: Array<{
   partyName: string;
   house: string;
   seats: number;
 }> = [
   // 衆議院（定数465）
   { partyName: "自由民主党・無所属の会",   house: "衆議院", seats: 197 },
   { partyName: "立憲民主党・無所属",       house: "衆議院", seats: 148 },
   { partyName: "日本維新の会・教育無償化を実現する会", house: "衆議院", seats: 38 },
   { partyName: "公明党",                   house: "衆議院", seats: 24 },
   { partyName: "国民民主党・無所属クラブ", house: "衆議院", seats: 28 },
   { partyName: "日本共産党",               house: "衆議院", seats: 8 },
   { partyName: "れいわ新選組",             house: "衆議院", seats: 9 },
   { partyName: "有志の会",                 house: "衆議院", seats: 4 },
   { partyName: "参政党",                   house: "衆議院", seats: 3 },

   // 参議院（定数248）
   { partyName: "自由民主党",               house: "参議院", seats: 116 },
   { partyName: "立憲民主・社民・無所属",   house: "参議院", seats: 40 },
   { partyName: "公明党",                   house: "参議院", seats: 27 },
   { partyName: "日本維新の会",             house: "参議院", seats: 21 },
   { partyName: "国民民主党・新緑風会",     house: "参議院", seats: 11 },
   { partyName: "日本共産党",               house: "参議院", seats: 11 },
   { partyName: "れいわ新選組",             house: "参議院", seats: 5 },
 ];

 async function main() {
   console.log("=== Party 初期データ投入 ===\n");

   // Party を upsert
   const partyMap = new Map<string, string>(); // name → id

   for (const p of PARTIES) {
     const party = await prisma.party.upsert({
       where: { name: p.name },
       update: { shortName: p.shortName, color: p.color },
       create: { name: p.name, shortName: p.shortName, color: p.color },
     });
     partyMap.set(party.name, party.id);
     console.log(`  ✓ ${p.shortName}（${p.name}）`);
   }

   console.log(`\n  計 ${PARTIES.length} 会派を登録\n`);

   // PartySeat を upsert
   console.log("=== PartySeat 議席数データ投入 ===\n");

   const asOf = new Date("2025-01-24"); // 第217回国会開会日

   for (const s of SEATS) {
     const partyId = partyMap.get(s.partyName);
     if (!partyId) {
       console.log(`  ✗ ${s.partyName} → Party が見つかりません`);
       continue;
     }

     await prisma.partySeat.upsert({
       where: {
         partyId_house_asOf: {
           partyId,
           house: s.house,
           asOf,
         },
       },
       update: { seats: s.seats },
       create: {
         partyId,
         house: s.house,
         seats: s.seats,
         asOf,
       },
     });

     console.log(`  ✓ ${s.house} ${s.partyName}: ${s.seats}席`);
   }

   console.log(`\n  計 ${SEATS.length} 件の議席データを登録`);
   console.log("\n=== 完了 ===");
 }

 main()
   .catch((e) => {
     console.error(e);
     process.exit(1);
   })
   .finally(() => prisma.$disconnect());
