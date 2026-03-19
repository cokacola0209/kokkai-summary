/**
 * 再利用コンポーネント群
 */
import Link from "next/link";

// ──────────────────────────────────────────
// Badge
// ──────────────────────────────────────────
const HOUSE_COLORS: Record<string, string> = {
  衆議院: "bg-blue-100 text-blue-800 border border-blue-200",
  参議院: "bg-green-100 text-green-800 border border-green-200",
};

export function HouseBadge({ house }: { house: string }) {
  const cls = HOUSE_COLORS[house] ?? "bg-slate-100 text-slate-700 border border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {house}
    </span>
  );
}

export function TopicTag({ tag }: { tag: string }) {
  const cleaned = tag.replace(/^[#＃]+/, "").trim();
  return (
    <Link
      href={`/topics/${encodeURIComponent(cleaned)}`}
      className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors duration-150"
    >
      #{cleaned}
    </Link>
  );
}

// ──────────────────────────────────────────
// SummaryCard (一覧用) — 改善版
// ──────────────────────────────────────────
interface SummaryCardProps {
  id: string;
  date: string;
  house: string;
  nameOfMeeting: string;
  bullets: string[];
  keyTopics: string[];
}

export function SummaryCard({
  id,
  date,
  house,
  nameOfMeeting,
  bullets,
  keyTopics,
}: SummaryCardProps) {
  // 会議名から種別を推定（本会議 / 委員会 等）
  const meetingType = getMeetingType(nameOfMeeting);

  return (
    <Link
      href={`/meetings/${id}`}
      className="block card hover:border-blue-300 group"
    >
      {/* ヘッダ行: 日付 + 種別 + 院 */}
      <div className="flex items-center gap-2 mb-2 text-xs">
        <span className="text-slate-400">{date}</span>
        {meetingType && (
          <span className="text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
            {meetingType}
          </span>
        )}
        <span className="ml-auto">
          <HouseBadge house={house} />
        </span>
      </div>

      {/* 会議名 */}
      <h2 className="font-semibold text-slate-800 leading-snug group-hover:text-blue-700 transition-colors">
        {nameOfMeeting}
      </h2>

      {/* 要約ポイント（最大3件） */}
      {bullets.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {bullets.slice(0, 3).map((b, i) => (
            <li key={i} className="text-sm text-slate-600 flex gap-2">
              <span className="text-blue-400 mt-0.5 shrink-0">•</span>
              <span className="line-clamp-2">{b}</span>
            </li>
          ))}
        </ul>
      )}

      {/* トピックタグ */}
      {keyTopics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {keyTopics.slice(0, 4).map((t) => (
            <span
              key={t}
              className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
            >
              #{t}
            </span>
          ))}
          {keyTopics.length > 4 && (
            <span className="text-xs text-slate-400">
              +{keyTopics.length - 4}
            </span>
          )}
        </div>
      )}

      {/* 「詳しく見る」リンク表示 */}
      <p className="mt-3 text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
        詳しく見る →
      </p>
    </Link>
  );
}

// ──────────────────────────────────────────
// MeetingListCard (一覧ページ専用)
// ──────────────────────────────────────────
interface MeetingListCardProps {
  id: string;
  house: string;
  nameOfMeeting: string;
  agreementPoints: string[];
  conflictPoints: string[];
  keyTopics: string[];
}

export function MeetingListCard({
  id,
  house,
  nameOfMeeting,
  agreementPoints,
  conflictPoints,
  keyTopics,
}: MeetingListCardProps) {
  const meetingType = getMeetingType(nameOfMeeting);

  const agreementText =
    agreementPoints[0] ?? "この会議では説明・確認・審議の進行が中心でした。";

  const conflictText =
    conflictPoints[0] ?? "この要約では大きな対立点は強く示されていません。";

  const visibleTopics = keyTopics.slice(0, 3);

  return (
    <Link
      href={`/meetings/${id}`}
      className="group block rounded-xl border border-slate-200 bg-white p-3 transition-all duration-150 hover:border-blue-300 hover:shadow-sm sm:p-4"
    >
      {/* 上段メタ情報 */}
      <div className="mb-2 flex items-center gap-2 sm:mb-3">
        <HouseBadge house={house} />
        {meetingType && (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500 sm:px-2.5 sm:text-xs">
            {meetingType}
          </span>
        )}
      </div>

      {/* 会議名 */}
      <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800 transition-colors group-hover:text-blue-700 sm:text-base">
        {nameOfMeeting}
      </h2>

      {/* 決まったこと / 争点 — スマホでは非表示 */}
      <div className="mt-3 hidden space-y-2 sm:block">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-medium text-slate-500">何が決まったか</p>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-700">{agreementText}</p>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-medium text-slate-500">主な争点</p>
          <p className={`mt-1 line-clamp-2 text-sm leading-6 ${conflictPoints.length > 0 ? "text-slate-700" : "text-slate-400"}`}>{conflictText}</p>
        </div>
      </div>

      {/* スマホ用: 1行プレビュー */}
      <p className="mt-1.5 line-clamp-1 text-xs text-slate-500 sm:hidden">
        {agreementPoints[0] ?? keyTopics[0] ? `#${keyTopics[0]}` : ""}
      </p>

      {/* タグ */}
      <div className="mt-2 flex flex-wrap gap-1 sm:mt-3 sm:gap-1.5">
        {visibleTopics.length > 0 ? (
          <>
            {visibleTopics.map((topic) => (
              <span key={topic} className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 sm:px-2.5 sm:py-1 sm:text-xs">
                #{topic}
              </span>
            ))}
            {keyTopics.length > visibleTopics.length && (
              <span className="inline-block rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-400 sm:px-2.5 sm:py-1 sm:text-xs">
                +{keyTopics.length - visibleTopics.length}
              </span>
            )}
          </>
        ) : (
          <span className="text-[11px] text-slate-400 sm:text-xs">タグなし</span>
        )}
      </div>
    </Link>
  );
}

// ──────────────────────────────────────────
// Section wrapper — 改善版
// ──────────────────────────────────────────
export function Section({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mb-8 ${className}`}>
      <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">
        {icon && <span className="text-base">{icon}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

// ──────────────────────────────────────────
// BulletList — 改善版
// ──────────────────────────────────────────
export function BulletList({
  items,
  color = "blue",
}: {
  items: string[];
  color?: "blue" | "green" | "red" | "amber";
}) {
  const colorMap = {
    blue: "text-blue-500",
    green: "text-green-500",
    red: "text-red-500",
    amber: "text-amber-500",
  };
  const bgMap = {
    blue: "bg-blue-50",
    green: "bg-green-50",
    red: "bg-red-50",
    amber: "bg-amber-50",
  };
  if (items.length === 0) {
    return <p className="text-sm text-slate-400 py-2">該当なし</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li
          key={i}
          className={`flex gap-3 text-sm text-slate-700 rounded-lg p-3 ${bgMap[color]} bg-opacity-50`}
        >
          <span className={`${colorMap[color]} mt-0.5 shrink-0 font-bold`}>▸</span>
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ──────────────────────────────────────────
// SourceLinks
// ──────────────────────────────────────────
export function SourceLinks({ links }: { links: string[] }) {
  return (
    <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
      <p className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
        <span>📌</span> 一次情報リンク（必ずご確認ください）
      </p>
      <ul className="space-y-2">
        {links.map((link, i) => (
          <li key={i}>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 underline hover:text-blue-800 break-all"
            >
              {link}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ──────────────────────────────────────────
// NoData
// ──────────────────────────────────────────
export function NoData({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
      <span className="text-5xl mb-4">📭</span>
      <p className="text-base">{message}</p>
    </div>
  );
}

// ══════════════════════════════════════════
// 新規コンポーネント
// ══════════════════════════════════════════

// ──────────────────────────────────────────
// HighlightBox — 「この会議の見どころ」
// 既存DBデータから見どころを自動構成
// ──────────────────────────────────────────
interface HighlightBoxProps {
  bullets: string[];
  conflictPoints: string[];
  impactNotes: string[];
  agreementPoints: string[];
}

export function HighlightBox({
  bullets,
  conflictPoints,
  impactNotes,
  agreementPoints,
}: HighlightBoxProps) {
  // 見どころがなければ非表示
  const hasConflict = conflictPoints.length > 0;
  const hasImpact = impactNotes.length > 0;
  const hasAgreement = agreementPoints.length > 0;

  if (!hasConflict && !hasImpact && !hasAgreement && bullets.length === 0) {
    return null;
  }

  // メイン見出し: 最初のbulletを要旨として使用
  const headline = bullets[0] ?? "";

  return (
    <div className="highlight-card fade-in-up mb-8">
      <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">
        💡 この会議の見どころ
      </p>

      {/* 一言要旨 */}
      {headline && (
        <p className="text-base font-medium text-slate-800 leading-relaxed mb-4">
          {headline}
        </p>
      )}

<div className="grid gap-2 grid-cols-1 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
        {/* 注目の論点 */}
        {hasConflict && (
          <div className="rounded-lg bg-white/70 p-3 border border-red-100">
            <p className="text-xs font-semibold text-red-600 mb-1.5">
              ⚖️ 注目の論点
            </p>
            <p className="text-sm text-slate-700 line-clamp-3">
              {conflictPoints[0]}
            </p>
          </div>
        )}

        {/* なぜ重要か */}
        {hasImpact && (
          <div className="rounded-lg bg-white/70 p-3 border border-amber-100">
            <p className="text-xs font-semibold text-amber-600 mb-1.5">
              🔍 なぜ重要？
            </p>
            <p className="text-sm text-slate-700 line-clamp-3">
              {impactNotes[0]}
            </p>
          </div>
        )}

        {/* 決まったこと */}
        {hasAgreement && (
          <div className="rounded-lg bg-white/70 p-3 border border-green-100">
            <p className="text-xs font-semibold text-green-600 mb-1.5">
              ✅ 決まったこと
            </p>
            <p className="text-sm text-slate-700 line-clamp-3">
              {agreementPoints[0]}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// BeginnerGuide — 初心者向け解説ブロック
// ──────────────────────────────────────────
export function BeginnerGuide() {
  return (
    <details className="card group mb-6 cursor-pointer">
      <summary className="flex items-center gap-2 font-semibold text-slate-700 list-none select-none">
        <span>📖</span>
        <span>はじめての方へ ― 国会ラボの読み方</span>
        <span className="ml-auto text-xs text-slate-400 group-open:hidden">
          ▶ 開く
        </span>
        <span className="ml-auto text-xs text-slate-400 hidden group-open:inline">
          ▼ 閉じる
        </span>
      </summary>

      <div className="mt-4 space-y-4 text-sm text-slate-600 leading-relaxed">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-blue-50/50 p-4">
            <p className="font-semibold text-slate-700 mb-1">🏛 国会とは？</p>
            <p>
              国の法律や予算を決める場所です。「衆議院」と「参議院」の2つの議院で構成されており、それぞれ複数の「委員会」で専門的な議論が行われます。
            </p>
          </div>

          <div className="rounded-lg bg-green-50/50 p-4">
            <p className="font-semibold text-slate-700 mb-1">📋 このサイトの見方</p>
            <p>
              毎日の審議内容をAIが要約しています。各会議の「要約」「合意事項」「対立点」「社会的影響」を確認できます。気になるトピックのタグをクリックすると、関連する会議を横断的に見られます。
            </p>
          </div>

          <div className="rounded-lg bg-amber-50/50 p-4">
            <p className="font-semibold text-slate-700 mb-1">⚖️ 衆議院と参議院</p>
            <p>
              衆議院は任期4年（解散あり）で465名、参議院は任期6年（3年ごとに半数改選）で248名で構成されます。両院で議論された後、法律が成立します。
            </p>
          </div>

          <div className="rounded-lg bg-red-50/50 p-4">
            <p className="font-semibold text-slate-700 mb-1">⚠️ AI要約について</p>
            <p>
              要約はAIが自動生成したものであり、正確性を保証するものではありません。重要な内容については、必ず「一次情報を見る」リンクから原文をご確認ください。
            </p>
          </div>
        </div>
      </div>
    </details>
  );
}

// ──────────────────────────────────────────
// DateGroupHeader — 日付ごとのグループ見出し
// ──────────────────────────────────────────
export function DateGroupHeader({
  date,
  count,
}: {
  date: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex items-center gap-2">
        <span className="text-base">📅</span>
        <span className="font-semibold text-slate-700">{date}</span>
      </div>
      <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
        {count}件
      </span>
      <div className="flex-1 border-t border-slate-200" />
    </div>
  );
}

// ──────────────────────────────────────────
// StatCard — 統計表示用コンポーネント
// ──────────────────────────────────────────
export function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white border border-slate-100 p-3">
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// ユーティリティ関数
// ──────────────────────────────────────────

/** 会議名から種別を推定 */
function getMeetingType(name: string): string | null {
  if (name.includes("本会議")) return "本会議";
  if (name.includes("予算委員会")) return "予算";
  if (name.includes("委員会")) return "委員会";
  if (name.includes("審査会")) return "審査会";
  if (name.includes("調査会")) return "調査会";
  return null;
}
