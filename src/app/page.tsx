// src/app/page.tsx
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SummaryCard, NoData, Section, BulletList, SourceLinks, HouseBadge, TopicTag } from "@/components/ui";

export const revalidate = 3600; // 1時間キャッシュ

export async function generateMetadata(): Promise<Metadata> {
  const latestDate = await prisma.meeting.findFirst({
    orderBy: { date: "desc" },
    select: { date: true },
  });
  const dateStr = latestDate
    ? latestDate.date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })
    : "";
  return {
    title: `今日の国会まとめ${dateStr ? ` – ${dateStr}` : ""}`,
    description: `${dateStr}の国会審議をAIが3分で要約。根拠・影響・未解決点を構造化表示。`,
  };
}

async function getLatestMeetings() {
  // 最新日付の会議を取得
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

// 全会議のキートピックを集約してトップ10抽出
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

// 全会議の agreementPoints をまとめる
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

// ──────────────────────────────────────────
// JSON-LD 構造化データ
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
    publisher: {
      "@type": "Organization",
      name: "国会サマリ",
    },
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
  const meetingsWithSummary = meetings.filter((m) => m.summary);

  return (
    <>
      <NewsArticleJsonLd date={date} meetingCount={meetings.length} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* ヘッダ */}
        <div className="mb-8">
          <p className="text-sm text-slate-400 mb-1">
            {dateStr} の国会 — {meetings.length} 件の審議
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            今日の国会 3分まとめ
          </h1>
          <p className="mt-2 text-slate-500 text-sm">
            国立国会図書館の会議録をAIが構造化要約。評価語は使用せず、根拠・影響・未解決点を明示しています。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* メインカラム */}
          <div className="lg:col-span-2 space-y-6">
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
                      <li key={i} className="text-sm">
                        <span className="text-green-600 font-medium mr-2">▸</span>
                        {a.text}
                        <span className="text-xs text-slate-400 ml-2">
                          [{a.meeting}]
                        </span>
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

          {/* サイドバー */}
          <aside className="space-y-4">
            <div className="card">
              <p className="font-semibold text-slate-700 mb-3">📊 本日の統計</p>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">審議件数</dt>
                  <dd className="font-medium">{meetings.length} 件</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">要約済み</dt>
                  <dd className="font-medium">{meetingsWithSummary.length} 件</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">総発言数</dt>
                  <dd className="font-medium">
                    {meetings.reduce((s, m) => s + m._count.speeches, 0).toLocaleString()} 発言
                  </dd>
                </div>
              </dl>
            </div>

            <div className="card">
              <p className="font-semibold text-slate-700 mb-2">⚠️ ご注意</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                本サービスはAIによる自動要約です。内容の正確性を保証しません。
                重要事項は必ず一次情報（国立国会図書館）をご確認ください。
              </p>
            </div>

            <div className="card">
              <p className="font-semibold text-slate-700 mb-2">🏛 院別</p>
              <div className="space-y-1">
                {["衆議院", "参議院"].map((house) => {
                  const count = meetings.filter((m) => m.house === house).length;
                  return (
                    <div key={house} className="flex justify-between text-sm">
                      <HouseBadge house={house} />
                      <span className="text-slate-500">{count} 件</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
