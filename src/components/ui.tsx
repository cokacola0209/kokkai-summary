// src/components/ui.tsx
/**
 * 再利用コンポーネント群
 */
import Link from "next/link";

// ──────────────────────────────────────────
// Badge
// ──────────────────────────────────────────
const HOUSE_COLORS: Record<string, string> = {
  衆議院: "bg-blue-100 text-blue-800",
  参議院: "bg-green-100 text-green-800",
};

export function HouseBadge({ house }: { house: string }) {
  const cls = HOUSE_COLORS[house] ?? "bg-slate-100 text-slate-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {house}
    </span>
  );
}

export function TopicTag({ tag }: { tag: string }) {
  return (
    <Link
      href={`/topics/${encodeURIComponent(tag)}`}
      className="inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200 transition"
    >
      #{tag}
    </Link>
  );
}

// ──────────────────────────────────────────
// SummaryCard (一覧用)
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
  return (
    <Link href={`/meetings/${id}`} className="block card hover:border-blue-300">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <p className="text-xs text-slate-400 mb-1">{date}</p>
          <h2 className="font-semibold text-slate-800 leading-snug">
            {nameOfMeeting}
          </h2>
        </div>
        <HouseBadge house={house} />
      </div>
      {bullets.length > 0 && (
        <ul className="mt-2 space-y-1">
          {bullets.slice(0, 3).map((b, i) => (
            <li key={i} className="text-sm text-slate-600 flex gap-2">
              <span className="text-blue-400 mt-0.5">•</span>
              <span className="line-clamp-2">{b}</span>
            </li>
          ))}
        </ul>
      )}
      {keyTopics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {keyTopics.slice(0, 5).map((t) => (
            <TopicTag key={t} tag={t} />
          ))}
        </div>
      )}
    </Link>
  );
}

// ──────────────────────────────────────────
// Section wrapper
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
    <section className={`mb-6 ${className}`}>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800 mb-3">
        {icon && <span>{icon}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

// ──────────────────────────────────────────
// BulletList
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
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">なし</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm text-slate-700">
          <span className={`${colorMap[color]} mt-0.5 shrink-0`}>▸</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ──────────────────────────────────────────
// SourceLink
// ──────────────────────────────────────────
export function SourceLinks({ links }: { links: string[] }) {
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-semibold text-amber-700 mb-2">
        📌 一次情報リンク（必ずご確認ください）
      </p>
      <ul className="space-y-1">
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
      <p>{message}</p>
    </div>
  );
}
