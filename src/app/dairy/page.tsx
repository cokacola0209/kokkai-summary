import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { HouseBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "日にち別まとめ一覧 – 国会ラボ",
  description:
    "国会の審議内容を日付ごとにまとめた「国会3分まとめ」のアーカイブです。過去のまとめを日付で探せます。",
};

// ──────────────────────────────────────────
// データ取得: 会議がある日付を一覧取得
// ──────────────────────────────────────────

interface DaySummary {
  date: Date;
  dateStr: string;
  meetingCount: number;
  houseBreakdown: { shu: number; san: number };
  topTopics: string[];
  editorNote: {
    title: string;
    introText: string;
    status: string;
  } | null;
}

async function getDailySummaries(): Promise<DaySummary[]> {
  // 会議のある全日付を取得（新しい順）
  const dates = await prisma.meeting.findMany({
    select: { date: true },
    distinct: ["date"],
    orderBy: { date: "desc" },
  });

  if (dates.length === 0) return [];

  // 各日付のデータをまとめて取得
  const results: DaySummary[] = [];

  for (const { date } of dates) {
    // 会議件数と院別内訳
    const meetings = await prisma.meeting.findMany({
      where: { date },
      select: {
        house: true,
        summary: {
          select: { keyTopics: true },
        },
      },
    });

    const shu = meetings.filter((m) => m.house === "衆議院").length;
    const san = meetings.filter((m) => m.house === "参議院").length;

    // トピック集計（上位3つ）
    const topicCounts = new Map<string, number>();
    for (const m of meetings) {
      for (const t of m.summary?.keyTopics ?? []) {
        topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
      }
    }
    const topTopics = Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);

    // 管理者まとめ（あれば）
    const editorNote = await prisma.dailyEditorNote.findUnique({
      where: { targetDate: date },
      select: {
        title: true,
        introText: true,
        status: true,
      },
    });

    const dateStr = date.toISOString().slice(0, 10);

    results.push({
      date,
      dateStr,
      meetingCount: meetings.length,
      houseBreakdown: { shu, san },
      topTopics,
      editorNote: editorNote
        ? {
            title: editorNote.title,
            introText: editorNote.introText,
            status: editorNote.status,
          }
        : null,
    });
  }

  return results;
}

// ──────────────────────────────────────────
// ページ
// ──────────────────────────────────────────

export default async function DailyArchivePage() {
  const days = await getDailySummaries();

  // 月ごとにグループ化
  const grouped = new Map<string, DaySummary[]>();
  for (const day of days) {
    const monthKey = day.dateStr.slice(0, 7); // "2026-03"
    if (!grouped.has(monthKey)) {
      grouped.set(monthKey, []);
    }
    grouped.get(monthKey)!.push(day);
  }

  return (
    <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
      {/* パンくず */}
      <nav className="mb-4 text-sm text-slate-400">
        <Link href="/" className="transition hover:text-slate-600">
          ホーム
        </Link>{" "}
        / <span className="text-slate-600">日にち別まとめ</span>
      </nav>

      {/* ── ヘッダ ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          📅 日にち別 国会3分まとめ
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          国会で何があったかを日付ごとにまとめています。
          気になる日付を選ぶと、その日の審議全体を3分で把握できます。
        </p>
      </div>

      {/* ── 役割の違い説明 ── */}
      <div className="mb-6 grid gap-2 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3">
          <span className="text-lg">📅</span>
          <div>
            <p className="text-sm font-bold text-blue-800">このページ</p>
            <p className="text-xs text-blue-600">
              その日の国会全体を3分で把握するまとめ
            </p>
          </div>
        </div>
        <Link
          href="/meetings"
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-blue-200 hover:bg-blue-50/30"
        >
          <span className="text-lg">📋</span>
          <div>
            <p className="text-sm font-bold text-slate-700">会議一覧</p>
            <p className="text-xs text-slate-500">
              個別の会議を探して詳しく見る →
            </p>
          </div>
        </Link>
      </div>

      {/* ── 統計 ── */}
      <div className="mb-6 flex items-center gap-4 text-sm text-slate-500">
        <span>全 {days.length} 日分</span>
        <span>·</span>
        <span>
          {days.reduce((sum, d) => sum + d.meetingCount, 0).toLocaleString()} 件の会議
        </span>
      </div>

      {/* ── 一覧（月別グループ） ── */}
      {days.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <span className="text-5xl mb-4">📭</span>
          <p className="text-base">まだまとめがありません</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(grouped).map(([monthKey, monthDays]) => {
            const [year, month] = monthKey.split("-");
            return (
              <section key={monthKey}>
                {/* 月見出し */}
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-base font-bold text-slate-800">
                    {year}年{parseInt(month)}月
                  </h2>
                  <span className="text-xs text-slate-400">
                    {monthDays.length}日分
                  </span>
                  <div className="flex-1 border-t border-slate-200" />
                </div>

                {/* 日付カード一覧 */}
                <div className="space-y-2">
                  {monthDays.map((day) => (
                    <DayCard key={day.dateStr} day={day} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────
// 日付カード
// ──────────────────────────────────────────

function DayCard({ day }: { day: DaySummary }) {
  const displayDate = day.date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  const hasEditorNote = day.editorNote && day.editorNote.status === "published";

  return (
    <Link
      href={`/daily/${day.dateStr}`}
      className="group block rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-150 hover:border-blue-300 hover:shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* 左: メイン情報 */}
        <div className="min-w-0 flex-1">
          {/* 日付 + バッジ */}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-base font-bold text-slate-800 group-hover:text-blue-700 transition-colors">
              {displayDate}
            </span>
            {hasEditorNote && (
              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                📝 管理者まとめあり
              </span>
            )}
          </div>

          {/* 管理者まとめ タイトル + 冒頭文 */}
          {hasEditorNote && day.editorNote!.title && (
            <p className="mb-1 text-sm font-medium text-slate-700">
              {day.editorNote!.title}
            </p>
          )}
          {hasEditorNote && day.editorNote!.introText && (
            <p className="text-sm text-slate-500 line-clamp-1">
              {day.editorNote!.introText}
            </p>
          )}

          {/* トピックタグ */}
          {day.topTopics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {day.topTopics.map((topic) => (
                <span
                  key={topic}
                  className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500"
                >
                  #{topic}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 右: メタ情報 */}
        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {day.meetingCount}件の会議
          </span>
          <span className="text-[11px] text-slate-400">
            衆{day.houseBreakdown.shu} / 参{day.houseBreakdown.san}
          </span>
        </div>
      </div>

      {/* 「まとめを見る」 */}
      <p className="mt-3 text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
        この日のまとめを見る →
      </p>
    </Link>
  );
}
