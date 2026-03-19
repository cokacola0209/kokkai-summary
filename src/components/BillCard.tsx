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
 // BillCard — 法案一覧用カード
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
   // 最も重要な日付を表示
   const displayDate = enactedAt ?? passedAt ?? submittedAt;
   const dateStr = displayDate
     ? displayDate.toLocaleDateString("ja-JP", {
         year: "numeric",
         month: "short",
         day: "numeric",
       })
     : "";

   const dateLabel =
     enactedAt
       ? "成立"
       : passedAt
         ? "可決"
         : "提出";

   return (
     <div className="group rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-150 hover:border-blue-300 hover:shadow-sm sm:p-5">
       {/* 上段: ステータス + 院 + 法案番号 */}
       <div className="mb-3 flex flex-wrap items-center gap-2">
         <BillStatusBadge status={status} />
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
       </div>

       {/* 法案名 */}
       <h3 className="text-sm font-bold leading-snug text-slate-800 sm:text-base">
         {title}
       </h3>

       {/* 概要 */}
       {summary && (
         <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">
           {summary}
         </p>
       )}

       {/* 下段: 日付 */}
       {dateStr && (
         <p className="mt-3 text-xs text-slate-400">
           {dateLabel}: {dateStr}
         </p>
       )}
     </div>
   );
 }

 // ──────────────────────────────────────────
 // BillMiniCard — 会議詳細の関連法案表示用（コンパクト版）
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
           <h2 className="text-base font-bold text-slate-800">
             最近の法案
           </h2>
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
