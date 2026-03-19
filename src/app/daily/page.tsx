import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "日にち別まとめ一覧 – 国会ラボ",
  description:
    "国会の審議内容を日付ごとにまとめた「国会3分まとめ」のアーカイブです。過去のまとめを日付で探せます。",
};

// ──────────────────────────────────────────
// データ取得（高速版: クエリ2回のみ）
// ──────────────────────────────────────────

async function getDailySummaries() {
  // 1回目: 全会議を日付・院・トピック付きでまとめて取得
  const meetings = await prisma.meeting.findMany({
    select: {
      date: true,
      house: true,
      summary: {
        select: { keyTopics: true },
      },
    },
    orderBy: { date: "desc" },
  });

  // 2回目: 全管理者まとめを取得
  const editorNotes = await prisma.dailyEditorNote.findMany({
    select: {
      targetDate: true,
      title: true,
      introText: true,
      status: true,
    },
  });

  // 管理者まとめをマップ化
  const noteMap = new Map(
    editorNotes.map((n) => [n.targetDate.toISOString().slice(0, 10), n])
  );

  // JS側で日付ごとに集計
  const dayMap = new Map<
    string,
    {
      date: Date;
      dateStr: string;
      meetingCount: number;
      shu: number;
      san: number;
      topicCounts: Map<string, number>;
    }
  >();

  for (const m of meetings) {
    const dateStr = m.date.toISOString().slice(0, 10);
    if (!dayMap.has(dateStr)) {
      dayMap.set(dateStr, {
        date: m.date,
        dateStr,
        meetingCount: 0,
        shu: 0,
        san: 0,
        topicCounts: new Map(),
      });
    }
    const day = dayMap.get(dateStr)!;
    day.meetingCount++;
    if (m.house === "衆議院") day.shu++;
    else day.san++;
    for (const t of m.summary?.keyTopics ?? []) {
      day.topicCounts.set(t, (day.topicCounts.get(t) ?? 0) + 1);
    }
  }

  // 結果を配列に変換（新しい日付順）
  return Array.from(dayMap.values())
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((day) => {
      const topTopics = Array.from(day.topicCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([t]) => t);

      const note = noteMap.get(day.dateStr) ?? null;

      return {
        date: day.date,
        dateStr: day.dateStr,
        meetingCount: day.meetingCount,
        shu: day.shu,
        san: day.san,
        topTopics,
        editorNote: note
          ? { title: note.title, introText: note.introText, status: note.status }
          : null,
      };
    });
}

// ──────────────────────────────────────────
// ページ
// ──────────────────────────────────────────

type DaySummary = Awaited<ReturnType<typeof getDailySummaries>>[number];

export default async function DailyArchivePage() {
  const days = await getDailySummaries();

  // 月ごとにグループ化
  const grouped = new Map<string, DaySummary[]>();
  for (const day of days) {
    const monthKey = day.dateStr.slice(0, 7);
    if (!grouped.has(monthKey)) grouped.set(monthKey, []);
    grouped.get(monthKey)!.push(day);
  }

  const totalMeetings = days.reduce((sum, d) => sum + d.meetingCount, 0);

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
        <span>{totalMeetings.toLocaleString()} 件の会議</span>
      </div>

      {/* ── 一覧 ── */}
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
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-base font-bold text-slate-800">
                    {year}年{parseInt(month)}月
                  </h2>
                  <span className="text-xs text-slate-400">
                    {monthDays.length}日分
                  </span>
                  <div className="flex-1 border-t border-slate-200" />
                </div>

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

  const hasEditorNote =
    day.editorNote && day.editorNote.status === "published";

  return (
    <Link
      href={`/daily/${day.dateStr}`}
      className="group block rounded-2xl border border-slate-200 bg-white p-4 transition-all duration-150 hover:border-blue-300 hover:shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
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

        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {day.meetingCount}件の会議
          </span>
          <span className="text-[11px] text-slate-400">
            衆{day.shu} / 参{day.san}
          </span>
        </div>
      </div>

      <p className="mt-3 text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
        この日のまとめを見る →
      </p>
    </Link>
  );
}
