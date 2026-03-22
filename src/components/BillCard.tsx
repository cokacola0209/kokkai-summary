/**
 * 法案関連の共通コンポーネント
 */
 import Link from "next/link";

 // ──────────────────────────────────────────
 // ステータス定義
 // ──────────────────────────────────────────

 type BillStatus = "submitted" | "deliberating" | "passed" | "enacted";

 const STATUS_CONFIG: Record<
   BillStatus,
   { label: string; emoji: string; color: string; bg: string; border: string }
 > = {
   submitted: {
     label: "提出",
     emoji: "📝",
     color: "text-slate-600",
     bg: "bg-slate-100",
     border: "border-slate-200",
   },
   deliberating: {
     label: "審議中",
     emoji: "🟡",
     color: "text-amber-700",
     bg: "bg-amber-50",
     border: "border-amber-200",
   },
   passed: {
     label: "可決",
     emoji: "🟢",
     color: "text-blue-700",
     bg: "bg-blue-50",
     border: "border-blue-200",
   },
   enacted: {
     label: "成立",
     emoji: "✅",
     color: "text-green-700",
     bg: "bg-green-50",
     border: "border-green-200",
   },
 };

 // ──────────────────────────────────────────
 // BillStatusBadge — ステータスバッジ
 // ──────────────────────────────────────────

 export function BillStatusBadge({ status }: { status: string }) {
   const config = STATUS_CONFIG[status as BillStatus] ?? STATUS_CONFIG.submitted;
   return (
     <span
       className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.color} ${config.border}`}
     >
       <span>{config.emoji}</span>
       {config.label}
     </span>
   );
 }

 // ──────────────────────────────────────────
 // テーマ分類
 // ──────────────────────────────────────────

 export const BILL_THEMES: Record<string, string[]> = {
   "経済・財政": ["予算", "税", "財政", "経済", "金融", "減税", "賃金", "物価"],
   "社会保障・医療": ["医療", "介護", "保険", "年金", "療養", "社会保障", "福祉"],
   "子育て・教育": ["子ども", "子育て", "教育", "学校", "大学", "奨学金", "保育", "児童", "少子化"],
   "外交・防衛": ["防衛", "安全保障", "外交", "装備", "自衛"],
   "政治改革": ["政治資金", "選挙", "政治改革", "規正"],
   "エネルギー・環境": ["エネルギー", "再生可能", "電力", "脱炭素", "環境", "太陽電池"],
   "デジタル・技術": ["AI", "デジタル", "マイナンバー", "情報", "技術"],
   "農業・食料": ["農業", "食料", "農村", "農家", "食料安全保障"],
   "法務・人権": ["民法", "刑法", "夫婦別姓", "人権"],
 };

 export function getBillTheme(title: string, summary: string): string | null {
   const text = `${title} ${summary}`;
   for (const [theme, keywords] of Object.entries(BILL_THEMES)) {
     if (keywords.some((kw) => text.includes(kw))) {
       return theme;
     }
   }
   return null;
 }

 /** 提出元を billCode から判定 */
 export function getSubmitterType(billCode: string): string {
   if (billCode.includes("閣法")) return "閣法";
   if (billCode.includes("衆法")) return "衆法";
   if (billCode.includes("参法")) return "参法";
   return "その他";
 }

 // ──────────────────────────────────────────
 // BillCard — 法案一覧用カード（折りたたみ式）
 // ──────────────────────────────────────────

 interface BillCardProps {
   id: string;
   billCode: string;
   title: string;
   summary: string;
   status: string;
   house: string | null;
   submittedAt: Date | null;
   passedAt: Date | null;
   enactedAt: Date | null;
 }

 export function BillCard({
   id,
   billCode,
   title,
   summary,
   status,
   house,
   submittedAt,
   passedAt,
   enactedAt,
 }: BillCardProps) {
   const displayDate = enactedAt ?? passedAt ?? submittedAt;
   const dateStr = displayDate
     ? displayDate.toLocaleDateString("ja-JP", {
         year: "numeric",
         month: "short",
         day: "numeric",
       })
     : "";

   const dateLabel = enactedAt ? "成立" : passedAt ? "可決" : "提出";
   const theme = getBillTheme(title, summary);

   return (
     <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-sm">
       {/* 閉じた状態: ステータス + 法案名 */}
       <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
         <div className="flex min-w-0 flex-1 items-center gap-2.5">
           <BillStatusBadge status={status} />
           <span className="min-w-0 truncate text-sm font-bold text-slate-800">
             {title}
           </span>
         </div>
         <svg
           className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180"
           fill="none"
           viewBox="0 0 24 24"
           stroke="currentColor"
           strokeWidth={2}
         >
           <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
         </svg>
       </summary>

       {/* 開いた状態: 詳細情報 */}
       <div className="border-t border-slate-100 px-4 pb-4 pt-3">
       <p className="mb-2 text-sm font-bold text-slate-800">{title}</p>
         <div className="mb-3 flex flex-wrap items-center gap-2">
           {house && (
             <span
               className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                 house === "衆議院"
                   ? "bg-blue-100 text-blue-800 border border-blue-200"
                   : "bg-green-100 text-green-800 border border-green-200"
               }`}
             >
               {house}
             </span>
           )}
           <span className="text-xs text-slate-400">{billCode}</span>
           {theme && (
             <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
               {theme}
             </span>
           )}
         </div>

         {summary ? (
  <p className="text-sm leading-relaxed text-slate-600">{summary}</p>
) : (
  <p className="text-xs italic text-slate-400">
    ※ 概要は今後補足予定です。
  </p>
)}

         {dateStr && (
           <p className="mt-3 text-xs text-slate-400">
             {dateLabel}: {dateStr}
           </p>
         )}
       </div>
     </details>
   );
 }

 // ──────────────────────────────────────────
 // BillMiniCard — 会議詳細の関連法案表示用
 // ──────────────────────────────────────────

 interface BillMiniCardProps {
   billCode: string;
   title: string;
   status: string;
   relation: string;
 }

 const RELATION_LABELS: Record<string, string> = {
   related: "関連",
   submitted: "提出",
   passed: "可決",
   enacted: "成立",
 };

 export function BillMiniCard({
   billCode,
   title,
   status,
   relation,
 }: BillMiniCardProps) {
   const relationLabel = RELATION_LABELS[relation] ?? "関連";

   return (
     <Link
       href="/bills"
       className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-200 hover:shadow-sm sm:p-4"
     >
       <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm">
         📜
       </div>
       <div className="min-w-0 flex-1">
         <div className="mb-1 flex flex-wrap items-center gap-2">
           <BillStatusBadge status={status} />
           <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
             {relationLabel}
           </span>
         </div>
         <p className="line-clamp-2 text-sm font-medium text-slate-700">
           {title}
         </p>
         <p className="mt-1 text-xs text-slate-400">{billCode}</p>
       </div>
     </Link>
   );
 }

 // ──────────────────────────────────────────
 // BillsPreviewCard — トップページ用プレビュー
 // ──────────────────────────────────────────

 interface BillPreviewItem {
   billCode: string;
   title: string;
   status: string;
 }

 export function BillsPreviewCard({ bills }: { bills: BillPreviewItem[] }) {
   if (bills.length === 0) return null;

   return (
     <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
       <div className="mb-4 flex items-center justify-between">
         <div className="flex items-center gap-2">
           <span className="text-base">📜</span>
           <h2 className="text-base font-bold text-slate-800">最近の法案</h2>
         </div>
         <Link
           href="/bills"
           className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
         >
           すべて見る →
         </Link>
       </div>

       <div className="space-y-2.5">
         {bills.map((bill) => (
           <div
             key={bill.billCode}
             className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5"
           >
             <BillStatusBadge status={bill.status} />
             <p className="min-w-0 flex-1 truncate text-sm text-slate-700">
               {bill.title}
             </p>
           </div>
         ))}
       </div>

       <Link
         href="/bills"
         className="mt-4 flex items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200"
       >
         📜 国会で決まった法案を見る
       </Link>
     </div>
   );
 }

 // ──────────────────────────────────────────
 // ユーティリティ
 // ──────────────────────────────────────────

 export function getStatusLabel(status: string): string {
   return STATUS_CONFIG[status as BillStatus]?.label ?? status;
 }

 export function getStatusEmoji(status: string): string {
   return STATUS_CONFIG[status as BillStatus]?.emoji ?? "📝";
 }
