/**
 * 法案テストデータ投入スクリプト v2
 *
 * 使い方:
 *   npx tsx prisma/seed-bills.ts
 */
 import { PrismaClient } from "@prisma/client";

 const prisma = new PrismaClient();

 const bills = [
   // ════════════════════════════════════════
   // 成立（enacted）
   // ════════════════════════════════════════

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
   {
     billCode: "214-閣法-15",
     title: "入管法及び難民認定法の一部を改正する法律案",
     summary:
       "永住者の在留資格取り消し要件を追加し、税金や社会保険料の未納が一定期間続く場合に取り消し可能とする。外国人労働者の適正な管理と共生社会の実現を目的とする。",
     status: "enacted",
     house: "衆議院",
     submittedAt: new Date("2025-02-07"),
     passedAt: new Date("2025-06-07"),
     enactedAt: new Date("2025-06-21"),
   },
   {
     billCode: "214-閣法-20",
     title: "脱炭素社会の実現に資するための建築物のエネルギー消費性能の向上に関する法律案",
     summary:
       "2025年4月以降の新築住宅・建築物に省エネ基準への適合を義務化。断熱性能等級4以上を求め、ZEH・ZEB普及を後押しする。",
     status: "enacted",
     house: "衆議院",
     submittedAt: new Date("2025-02-14"),
     passedAt: new Date("2025-05-31"),
     enactedAt: new Date("2025-06-28"),
   },
   {
     billCode: "214-閣法-24",
     title: "重要経済安保情報保護法案",
     summary:
       "経済安全保障上の重要情報を扱う民間人にセキュリティ・クリアランス（適性評価）制度を導入。半導体やAI技術など重要技術情報の漏洩防止を強化する。",
     status: "enacted",
     house: "衆議院",
     submittedAt: new Date("2025-03-01"),
     passedAt: new Date("2025-05-10"),
     enactedAt: new Date("2025-06-14"),
   },
   {
     billCode: "214-閣法-28",
     title: "学校教育法の一部を改正する法律案",
     summary:
       "小学校の教科担任制を全国展開し、英語・理科・算数の専科教員を増員する。教員の働き方改革の一環として授業準備時間の確保も明記。",
     status: "enacted",
     house: "衆議院",
     submittedAt: new Date("2025-04-11"),
     passedAt: new Date("2025-07-18"),
     enactedAt: new Date("2025-08-01"),
   },
   {
     billCode: "214-閣法-31",
     title: "消費者契約法の一部を改正する法律案",
     summary:
       "サブスクリプション契約の解約手続き簡素化を義務付け。解約ボタンの設置義務、ダークパターンの禁止、クーリングオフ期間の適用拡大を盛り込む。",
     status: "enacted",
     house: "衆議院",
     submittedAt: new Date("2025-04-25"),
     passedAt: new Date("2025-08-22"),
     enactedAt: new Date("2025-09-12"),
   },
   {
     billCode: "214-閣法-33",
     title: "災害対策基本法の一部を改正する法律案",
     summary:
       "能登半島地震を教訓に、孤立集落対策・福祉避難所の整備基準・災害時の通信確保に関する規定を強化。個人の備蓄義務を努力義務として明記。",
     status: "enacted",
     house: "衆議院",
     submittedAt: new Date("2025-05-09"),
     passedAt: new Date("2025-09-05"),
     enactedAt: new Date("2025-09-26"),
   },
   {
     billCode: "214-閣法-36",
     title: "介護保険法の一部を改正する法律案",
     summary:
       "介護職員の処遇改善として月額平均6,000円の賃上げを実施。介護ロボット・ICT導入を促進する補助制度を創設し、人員配置基準の柔軟化を図る。",
     status: "enacted",
     house: "衆議院",
     submittedAt: new Date("2025-06-13"),
     passedAt: new Date("2025-10-17"),
     enactedAt: new Date("2025-11-07"),
   },

   // ════════════════════════════════════════
   // 可決（passed — 片院通過）
   // ════════════════════════════════════════

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
   {
     billCode: "214-閣法-39",
     title: "労働基準法の一部を改正する法律案",
     summary:
       "副業・兼業時の労働時間通算ルールを見直し、健康管理の義務を明確化。フリーランス保護の観点から、契約解除の事前通知義務も追加。",
     status: "passed",
     house: "衆議院",
     submittedAt: new Date("2025-09-12"),
     passedAt: new Date("2026-01-24"),
     enactedAt: null,
   },
   {
     billCode: "214-閣法-41",
     title: "地方創生推進法の一部を改正する法律案",
     summary:
       "地方移住者への支援金を拡充し、リモートワーク移住に対する税制優遇措置を新設。地方大学の定員増と地元就職促進を一体的に推進する。",
     status: "passed",
     house: "衆議院",
     submittedAt: new Date("2025-10-03"),
     passedAt: new Date("2026-02-07"),
     enactedAt: null,
   },

   // ════════════════════════════════════════
   // 審議中（deliberating）
   // ════════════════════════════════════════

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
   {
     billCode: "214-閣法-43",
     title: "水道法の一部を改正する法律案",
     summary:
       "老朽化する水道管の更新計画策定を自治体に義務付け。広域連携による運営効率化を推進し、国の財政支援を拡充する。人口減少地域の水道維持が課題。",
     status: "deliberating",
     house: "衆議院",
     submittedAt: new Date("2025-12-20"),
     passedAt: null,
     enactedAt: null,
   },
   {
     billCode: "214-閣法-44",
     title: "特定商取引法の一部を改正する法律案",
     summary:
       "SNSを通じた詐欺的勧誘への規制を強化。インフルエンサーマーケティングにおける広告表示義務と、投資詐欺への罰則を大幅に引き上げる。",
     status: "deliberating",
     house: "衆議院",
     submittedAt: new Date("2026-01-10"),
     passedAt: null,
     enactedAt: null,
   },
   {
     billCode: "214-衆法-12",
     title: "若者の政治参加促進に関する法律案",
     summary:
       "被選挙権年齢を衆議院25歳→18歳、参議院30歳→25歳に引き下げる議員立法。供託金の引き下げとオンライン選挙運動の拡充も盛り込む。",
     status: "deliberating",
     house: "衆議院",
     submittedAt: new Date("2026-01-24"),
     passedAt: null,
     enactedAt: null,
   },
   {
     billCode: "214-参法-5",
     title: "国民年金法の一部を改正する法律案",
     summary:
       "基礎年金の給付水準を維持するため、国庫負担割合を現行1/2から段階的に引き上げる議員立法。財源としてのマクロ経済スライド調整の見直しを含む。",
     status: "deliberating",
     house: "参議院",
     submittedAt: new Date("2026-02-14"),
     passedAt: null,
     enactedAt: null,
   },

   // ════════════════════════════════════════
   // 提出（submitted）
   // ════════════════════════════════════════

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
   {
     billCode: "214-閣法-46",
     title: "道路交通法の一部を改正する法律案",
     summary:
       "自動運転レベル4の公道走行に関する許可制度を新設。自動配送ロボットの歩道走行ルールと、電動キックボードの規制強化を盛り込む。",
     status: "submitted",
     house: "衆議院",
     submittedAt: new Date("2026-03-01"),
     passedAt: null,
     enactedAt: null,
   },
   {
     billCode: "214-閣法-47",
     title: "空き家対策特別措置法の一部を改正する法律案",
     summary:
       "管理不全空き家への固定資産税の住宅用地特例解除を全国展開。自治体による除却代執行の費用回収を容易にする改正を含む。",
     status: "submitted",
     house: "衆議院",
     submittedAt: new Date("2026-03-07"),
     passedAt: null,
     enactedAt: null,
   },
   {
     billCode: "214-参法-7",
     title: "カスタマーハラスメント防止法案",
     summary:
       "顧客による従業員への暴言・威圧行為を「カスハラ」と定義し、事業者に防止措置を義務付ける議員立法。悪質な場合の罰則規定と従業員の相談窓口設置を含む。",
     status: "submitted",
     house: "参議院",
     submittedAt: new Date("2026-03-14"),
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

   // 予算委員会 → 予算案
   const budgetMeetings = await prisma.meeting.findMany({
     where: { nameOfMeeting: { contains: "予算委員会" } },
     take: 3,
     orderBy: { date: "desc" },
   });
   const budgetBill = await prisma.bill.findUnique({
     where: { billCode: "214-閣法-1" },
   });
   if (budgetBill && budgetMeetings.length > 0) {
     for (const m of budgetMeetings) {
       await prisma.billMeeting.upsert({
         where: { billId_meetingId: { billId: budgetBill.id, meetingId: m.id } },
         update: {},
         create: { billId: budgetBill.id, meetingId: m.id, relation: "related" },
       });
     }
     console.log(`🔗 予算案を予算委員会 ${budgetMeetings.length} 件に紐づけ`);
   }

   // 厚生労働委員会 → 高額療養費・介護保険
   const healthMeetings = await prisma.meeting.findMany({
     where: { nameOfMeeting: { contains: "厚生労働委員会" } },
     take: 3,
     orderBy: { date: "desc" },
   });
   for (const code of ["214-閣法-22", "214-閣法-36"]) {
     const bill = await prisma.bill.findUnique({ where: { billCode: code } });
     if (bill && healthMeetings.length > 0) {
       for (const m of healthMeetings) {
         await prisma.billMeeting.upsert({
           where: { billId_meetingId: { billId: bill.id, meetingId: m.id } },
           update: {},
           create: { billId: bill.id, meetingId: m.id, relation: "related" },
         });
       }
       console.log(`🔗 ${code} を厚労委 ${healthMeetings.length} 件に紐づけ`);
     }
   }

   // 文教科学委員会 → 学校教育法・奨学金
   const eduMeetings = await prisma.meeting.findMany({
     where: {
       OR: [
         { nameOfMeeting: { contains: "文教科学委員会" } },
         { nameOfMeeting: { contains: "文部科学委員会" } },
       ],
     },
     take: 2,
     orderBy: { date: "desc" },
   });
   for (const code of ["214-閣法-28", "214-参法-3"]) {
     const bill = await prisma.bill.findUnique({ where: { billCode: code } });
     if (bill && eduMeetings.length > 0) {
       for (const m of eduMeetings) {
         await prisma.billMeeting.upsert({
           where: { billId_meetingId: { billId: bill.id, meetingId: m.id } },
           update: {},
           create: { billId: bill.id, meetingId: m.id, relation: "related" },
         });
       }
       console.log(`🔗 ${code} を文教委 ${eduMeetings.length} 件に紐づけ`);
     }
   }

   // 災害対策特別委員会 → 災害対策基本法
   const disasterMeetings = await prisma.meeting.findMany({
     where: { nameOfMeeting: { contains: "災害対策" } },
     take: 2,
     orderBy: { date: "desc" },
   });
   const disasterBill = await prisma.bill.findUnique({
     where: { billCode: "214-閣法-33" },
   });
   if (disasterBill && disasterMeetings.length > 0) {
     for (const m of disasterMeetings) {
       await prisma.billMeeting.upsert({
         where: { billId_meetingId: { billId: disasterBill.id, meetingId: m.id } },
         update: {},
         create: { billId: disasterBill.id, meetingId: m.id, relation: "related" },
       });
     }
     console.log(`🔗 災害対策基本法を災害対策委 ${disasterMeetings.length} 件に紐づけ`);
   }
 }

 main()
   .catch((e) => {
     console.error("❌ エラー:", e);
     process.exit(1);
   })
   .finally(() => prisma.$disconnect());
