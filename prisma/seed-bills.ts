/**
 * 法案テストデータ投入スクリプト
 *
 * 使い方:
 *   npx tsx prisma/seed-bills.ts
 *
 * ※ .env に DATABASE_URL が設定されている前提
 */
 import { PrismaClient } from "@prisma/client";

 const prisma = new PrismaClient();

 const bills = [
   // ── 成立済み ──
   {
     billCode: "214-閣法-1",
     title: "令和7年度一般会計予算",
     summary:
       "令和7年度の国の歳入歳出を定める予算案。社会保障費の増加に対応しつつ、防衛費の拡充や子ども・子育て支援の強化が柱。一般会計の総額は約115兆円規模。",
     status: "enacted",
     house: "衆議院",
     submittedAt: new Date("2025-01-24"),
     passedAt: new Date("2025-03-02"),
     enactedAt: new Date("2025-03-31"),
   },
   {
     billCode: "214-閣法-5",
     title: "子ども・子育て支援法の一部を改正する法律案",
     summary:
       "児童手当の支給対象を高校生まで拡大し、所得制限を撤廃。第3子以降の加算を月3万円に引き上げ。あわせて育児休業給付の拡充を盛り込む。",
     status: "enacted",
     house: "衆議院",
     submittedAt: new Date("2025-02-04"),
     passedAt: new Date("2025-05-10"),
     enactedAt: new Date("2025-06-14"),
   },
   {
     billCode: "214-閣法-12",
     title: "地方税法等の一部を改正する法律案",
     summary:
       "定額減税の実施に伴う地方税の調整措置と、ふるさと納税の返礼品基準の見直しを含む。個人住民税の定額減税1万円を実施する。",
     status: "enacted",
     house: "衆議院",
     submittedAt: new Date("2025-02-04"),
     passedAt: new Date("2025-03-28"),
     enactedAt: new Date("2025-03-31"),
   },
   {
     billCode: "214-閣法-18",
     title: "食料・農業・農村基本法の一部を改正する法律案",
     summary:
       "食料安全保障の強化を明記し、国内農業の生産基盤維持と食料自給率向上を図る。農家の所得安定対策や新規就農支援を拡充する内容を含む。",
     status: "enacted",
     house: "衆議院",
     submittedAt: new Date("2025-02-14"),
     passedAt: new Date("2025-05-24"),
     enactedAt: new Date("2025-06-21"),
   },

   // ── 可決（片院通過） ──
   {
     billCode: "214-閣法-22",
     title: "高額療養費制度の見直しに関する法律案",
     summary:
       "高額療養費の自己負担上限額を段階的に引き上げる案。現役世代の保険料負担を抑制しつつ、高齢者の負担能力に応じた見直しを行う。患者団体から反対意見も。",
     status: "passed",
     house: "衆議院",
     submittedAt: new Date("2025-03-01"),
     passedAt: new Date("2025-11-15"),
     enactedAt: null,
   },
   {
     billCode: "214-閣法-30",
     title: "防衛力整備計画に基づく装備品調達に関する特別措置法案",
     summary:
       "2027年度までの防衛費GDP比2%目標に向け、長期契約による装備品一括調達を可能にする特別措置。財源として建設国債の防衛転用が論点に。",
     status: "passed",
     house: "衆議院",
     submittedAt: new Date("2025-03-14"),
     passedAt: new Date("2025-12-20"),
     enactedAt: null,
   },

   // ── 審議中 ──
   {
     billCode: "214-閣法-35",
     title: "AI利活用及び規制に関する基本法案",
     summary:
       "AIの利活用推進とリスク管理の両立を目指す基本法。生成AIの透明性確保義務、重要インフラでのAI利用に関する安全基準の策定を政府に義務付ける。",
     status: "deliberating",
     house: "衆議院",
     submittedAt: new Date("2025-10-15"),
     passedAt: null,
     enactedAt: null,
   },
   {
     billCode: "214-閣法-38",
     title: "選択的夫婦別姓制度の導入に係る民法等の一部を改正する法律案",
     summary:
       "婚姻時に夫婦が同姓・別姓を選択できる制度を導入する改正案。戸籍法の改正を含み、子の氏は婚姻時に決定する。与党内でも賛否が分かれている。",
     status: "deliberating",
     house: "衆議院",
     submittedAt: new Date("2025-11-01"),
     passedAt: null,
     enactedAt: null,
   },
   {
     billCode: "214-衆法-8",
     title: "政治資金規正法の一部を改正する法律案",
     summary:
       "政治資金パーティーの対価の公開基準を5万円超に引き下げ、政策活動費の使途公開を義務化する議員立法。野党側から透明性が不十分との指摘あり。",
     status: "deliberating",
     house: "衆議院",
     submittedAt: new Date("2025-12-10"),
     passedAt: null,
     enactedAt: null,
   },

   // ── 提出 ──
   {
     billCode: "214-閣法-42",
     title: "再生可能エネルギー電気の利用促進に関する特別措置法改正案",
     summary:
       "再エネ賦課金制度の見直しと、ペロブスカイト太陽電池等の次世代技術への投資促進を盛り込む。2030年の再エネ比率目標を36〜38%から40%以上に引き上げ。",
     status: "submitted",
     house: "衆議院",
     submittedAt: new Date("2026-01-20"),
     passedAt: null,
     enactedAt: null,
   },
   {
     billCode: "214-参法-3",
     title: "奨学金制度の拡充に関する法律案",
     summary:
       "給付型奨学金の対象を中間所得層まで拡大し、返済型奨学金の金利を引き下げる議員立法。大学院生への支援も拡充。",
     status: "submitted",
     house: "参議院",
     submittedAt: new Date("2026-02-05"),
     passedAt: null,
     enactedAt: null,
   },
   {
     billCode: "214-閣法-45",
     title: "マイナンバー法の一部を改正する法律案",
     summary:
       "マイナンバーカードの利用範囲を運転免許証・在留カードに拡大し、健康保険証との一体化を完了させる。セキュリティ強化として生体認証の導入も検討。",
     status: "submitted",
     house: "衆議院",
     submittedAt: new Date("2026-02-28"),
     passedAt: null,
     enactedAt: null,
   },
 ];

 async function main() {
   console.log("🏛 法案テストデータを投入します...\n");

   for (const bill of bills) {
     const result = await prisma.bill.upsert({
       where: { billCode: bill.billCode },
       update: {
         title: bill.title,
         summary: bill.summary,
         status: bill.status,
         house: bill.house,
         submittedAt: bill.submittedAt,
         passedAt: bill.passedAt,
         enactedAt: bill.enactedAt,
       },
       create: bill,
     });
     const statusEmoji =
       bill.status === "enacted"
         ? "✅"
         : bill.status === "passed"
           ? "🟢"
           : bill.status === "deliberating"
             ? "🟡"
             : "📝";
     console.log(`  ${statusEmoji} ${result.billCode}: ${result.title}`);
   }

   console.log(`\n✅ ${bills.length}件の法案を投入しました`);

   // ── BillMeeting サンプル紐づけ ──
   // 直近の会議からいくつか取得して紐づけ
   const recentMeetings = await prisma.meeting.findMany({
     where: {
       nameOfMeeting: {
         contains: "予算委員会",
       },
     },
     take: 3,
     orderBy: { date: "desc" },
   });

   if (recentMeetings.length > 0) {
     const budgetBill = await prisma.bill.findUnique({
       where: { billCode: "214-閣法-1" },
     });

     if (budgetBill) {
       for (const meeting of recentMeetings) {
         await prisma.billMeeting.upsert({
           where: {
             billId_meetingId: {
               billId: budgetBill.id,
               meetingId: meeting.id,
             },
           },
           update: {},
           create: {
             billId: budgetBill.id,
             meetingId: meeting.id,
             relation: "related",
           },
         });
       }
       console.log(
         `\n🔗 予算案を予算委員会 ${recentMeetings.length} 件に紐づけました`
       );
     }
   }

   // 厚生労働委員会と高額療養費法案を紐づけ
   const healthMeetings = await prisma.meeting.findMany({
     where: {
       nameOfMeeting: {
         contains: "厚生労働委員会",
       },
     },
     take: 2,
     orderBy: { date: "desc" },
   });

   if (healthMeetings.length > 0) {
     const healthBill = await prisma.bill.findUnique({
       where: { billCode: "214-閣法-22" },
     });

     if (healthBill) {
       for (const meeting of healthMeetings) {
         await prisma.billMeeting.upsert({
           where: {
             billId_meetingId: {
               billId: healthBill.id,
               meetingId: meeting.id,
             },
           },
           update: {},
           create: {
             billId: healthBill.id,
             meetingId: meeting.id,
             relation: "related",
           },
         });
       }
       console.log(
         `🔗 高額療養費法案を厚労委 ${healthMeetings.length} 件に紐づけました`
       );
     }
   }
 }

 main()
   .catch((e) => {
     console.error("❌ エラー:", e);
     process.exit(1);
   })
   .finally(() => prisma.$disconnect());
