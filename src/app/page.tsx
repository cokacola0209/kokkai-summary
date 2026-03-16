import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import {
  SummaryCard,
  NoData,
  Section,
  BulletList,
  SourceLinks,
  HouseBadge,
  TopicTag,
  BeginnerGuide,
  StatCard,
} from "@/components/ui";

export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const latestDate = await prisma.meeting.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const dateStr = latestDate
    ? latestDate.date.toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";
  return {
    title: `今日の国会まとめ${dateStr ? ` – ${dateStr}` : ""}`,
    description: `${dateStr}の国会審議をAIが3分で要約。根拠・影響・未解決点を構造化表示。`,
  };
}

async function getLatestMeetings() {
  const latest = await prisma.meeting.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  if (!latest) return { meetings: [], date: null };

  const meetings = await prisma.meeting.findMany({
    where: { date: latest.date },
    orderBy: { nameOfMeeting: "asc" },
    include: {
      summary: true,
      _count: { select: { speeches: true } },
    },
  });

  return { meetings, date: latest.date };
}

function aggregateTopics(
  meetings: Awaited<ReturnType<typeof getLatestMeetings>>["meetings"]
): string[] {
  const counts = new Map<string, number>();
  for (const m of meetings) {
    for (const t of m.summary?.keyTopics ?? []) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t]) => t);
}

function aggregateAgreements(
  meetings: Awaited<ReturnType<typeof getLatestMeetings>>["meetings"]
): Array<{ text: string; meeting: string }> {
  return meetings.flatMap((m) =>
    (m.summary?.agreementPoints ?? []).map((a) => ({
      text: a,
      meeting: m.nameOfMeeting,
    }))
  );
}

// 本日の注目ポイント（conflictPoints + impactNotes から抽出）
function aggregateHighlights(
  meetings: Awaited<ReturnType<typeof getLatestMeetings>>["meetings"]
): Array<{ text: string; meeting: string; type: "conflict" | "impact" }> {
  const items: Array<{
    text: string;
    meeting: string;
    type: "conflict" | "impact";
  }> = [];
  for (const m of meetings) {
    for (const c of m.summary?.conflictPoints ?? []) {
      items.push({ text: c, meeting: m.nameOfMeeting, type: "conflict" });
    }
    for (const n of m.summary?.impactNotes ?? []) {
      items.push({ text: n, meeting: m.nameOfMeeting, type: "impact" });
    }
  }
  return items.slice(0, 5);
}

// ──────────────────────────────────────────
// JSON-LD
// ──────────────────────────────────────────
function NewsArticleJsonLd({
  date,
  meetingCount,
}: {
  date: Date;
  meetingCount: number;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: `${date.toLocaleDateString("ja-JP")}の国会審議まとめ`,
    datePublished: date.toISOString(),
    description: `${meetingCount}件の国会審議をAIが要約`,
    publisher: { "@type": "Organization", name: "国会ラボ" },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

// ──────────────────────────────────────────
// Page
// ──────────────────────────────────────────
export default async function HomePage() {
  const { meetings, date } = await getLatestMeetings();

  if (!date || meetings.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16">
        <NoData message="まだデータがありません。バッチジョブを実行してください。" />
      </div>
    );
  }

  const dateStr = date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const topTopics = aggregateTopics(meetings);
  const agreements = aggregateAgreements(meetings);
  const highlights = aggregateHighlights(meetings);
  const meetingsWithSummary = meetings.filter((m) => m.summary);
  const totalSpeeches = meetings.reduce(
    (s, m) => s + m._count.speeches,
    0
  );

  return (
    <>
      <NewsArticleJsonLd date={date} meetingCount={meetings.length} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* ── ヘッダ ── */}
        <div className="mb-6 fade-in">
          <p className="text-sm text-slate-400 mb-1">
            {dateStr} の国会 — {meetings.length} 件の審議
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            今日の国会 3分まとめ
          </h1>
          <p className="mt-2 text-slate-500 text-sm">
            国立国会図書館の会議録をもとに、その日の国会審議をAIでわかりやすく整理・要約しています。
          </p>
        </div>

        {/* ── 統計バー ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 fade-in-up delay-1">
          <StatCard icon="📋" label="審議件数" value={`${meetings.length}件`} />
          <StatCard
            icon="✅"
            label="要約済み"
            value={`${meetingsWithSummary.length}件`}
          />
          <StatCard
            icon="💬"
            label="総発言数"
            value={`${totalSpeeches.toLocaleString()}`}
          />
          <StatCard
            icon="🏛"
            label="衆/参"
            value={`${meetings.filter((m) => m.house === "衆議院").length}/${meetings.filter((m) => m.house === "参議院").length}`}
          />
        </div>

        {/* ── 初心者向けガイド ── */}
        <div className="fade-in-up delay-2">
          <BeginnerGuide />
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* ── メインカラム ── */}
          <div className="lg:col-span-2 space-y-6">
            {/* 本日の注目ポイント */}
            {highlights.length > 0 && (
              <Section title="本日の注目ポイント" icon="💡">
                <div className="space-y-2">
                  {highlights.map((h, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 rounded-lg p-3 text-sm ${
                        h.type === "conflict"
                          ? "bg-red-50/60 border border-red-100"
                          : "bg-amber-50/60 border border-amber-100"
                      }`}
                    >
                      <span className="shrink-0 mt-0.5">
                        {h.type === "conflict" ? "⚖️" : "🔍"}
                      </span>
                      <div>
                        <p className="text-slate-700 leading-relaxed">
                          {h.text}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {h.meeting}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* 本日のキートピック */}
            {topTopics.length > 0 && (
              <Section title="本日の主要トピック" icon="🏷">
                <div className="flex flex-wrap gap-2">
                  {topTopics.map((t) => (
                    <TopicTag key={t} tag={t} />
                  ))}
                </div>
              </Section>
            )}

            {/* 本日の合意・採決事項 */}
            {agreements.length > 0 && (
              <Section title="本日の主な合意・採決事項" icon="✅">
                <div className="card">
                  <ul className="space-y-2">
                    {agreements.map((a, i) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="text-green-500 font-medium shrink-0 mt-0.5">
                          ▸
                        </span>
                        <div>
                          <span className="text-slate-700">{a.text}</span>
                          <span className="text-xs text-slate-400 ml-2">
                            [{a.meeting}]
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </Section>
            )}

            {/* 会議別サマリ */}
            <Section title={`会議別サマリ（${meetings.length}件）`} icon="📋">
              <div className="space-y-4">
                {meetings.map((m) => (
                  <SummaryCard
                    key={m.id}
                    id={m.id}
                    date={m.date.toLocaleDateString("ja-JP")}
                    house={m.house}
                    nameOfMeeting={m.nameOfMeeting}
                    bullets={m.summary?.bullets ?? []}
                    keyTopics={m.summary?.keyTopics ?? []}
                  />
                ))}
              </div>
            </Section>
          </div>

          {/* ── サイドバー ── */}
          <aside className="space-y-4">
            <div className="card">
              <p className="font-semibold text-slate-700 mb-2">⚠️ ご注意</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                本サイトはAIによる自動要約サイトです。より正確な国会の内容を確認したい場合は、一次情報（
                <a
                  href="https://kokkai.ndl.go.jp/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-600"
                >
                  国立国会図書館
                </a>
                ）をご確認ください。
              </p>
            </div>

            <div className="card">
              <p className="font-semibold text-slate-700 mb-3">🏛 院別の内訳</p>
              <div className="space-y-2">
                {["衆議院", "参議院"].map((house) => {
                  const count = meetings.filter(
                    (m) => m.house === house
                  ).length;
                  const pct =
                    meetings.length > 0
                      ? Math.round((count / meetings.length) * 100)
                      : 0;
                  return (
                    <div key={house}>
                      <div className="flex justify-between text-sm mb-1">
                        <HouseBadge house={house} />
                        <span className="text-slate-500">{count} 件</span>
                      </div>
                      {/* プログレスバー */}
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            house === "衆議院" ? "bg-blue-400" : "bg-green-400"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 全件を見る導線 */}
            <a
              href="/meetings"
              className="block card text-center hover:border-blue-300"
            >
              <p className="text-sm font-medium text-blue-600">
                📚 過去の会議一覧を見る →
              </p>
            </a>
          </aside>
        </div>
      </div>
    </>
  );
}
