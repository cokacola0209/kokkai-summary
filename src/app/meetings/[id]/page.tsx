// src/app/meetings/[id]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  HouseBadge,
  TopicTag,
  Section,
  BulletList,
  SourceLinks,
} from "@/components/ui";

export const revalidate = 3600;

interface Props {
  params: { id: string };
}

// ──────────────────────────────────────────
// データ取得
// ──────────────────────────────────────────
async function getMeeting(id: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      summary: true,
      speeches: { orderBy: { order: "asc" } },
    },
  });
  return meeting;
}

// ──────────────────────────────────────────
// SEO
// ──────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const meeting = await getMeeting(params.id);
  if (!meeting) return { title: "会議が見つかりません" };

  const dateStr = meeting.date.toLocaleDateString("ja-JP");
  const desc = meeting.summary?.bullets[0] ?? `${meeting.nameOfMeeting}の会議録要約`;

  return {
    title: `${meeting.nameOfMeeting} – ${dateStr}`,
    description: desc.slice(0, 150),
    openGraph: {
      title: `${meeting.house} ${meeting.nameOfMeeting}`,
      description: desc.slice(0, 150),
    },
  };
}

// ──────────────────────────────────────────
// JSON-LD
// ──────────────────────────────────────────
function MeetingJsonLd({
  meeting,
}: {
  meeting: NonNullable<Awaited<ReturnType<typeof getMeeting>>>;
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${meeting.house} ${meeting.nameOfMeeting} – ${meeting.date.toLocaleDateString("ja-JP")}`,
    datePublished: meeting.date.toISOString(),
    description: meeting.summary?.bullets[0] ?? "",
    mainEntityOfPage: meeting.url,
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
// Speaker Summaries
// ──────────────────────────────────────────
interface SpeakerSummary {
  speaker: string;
  group: string | null;
  summary: string;
  quotes: string[];
}

function SpeakerCard({ s }: { s: SpeakerSummary }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">👤</span>
        <div>
          <p className="font-semibold text-slate-800 text-sm">{s.speaker}</p>
          {s.group && <p className="text-xs text-slate-400">{s.group}</p>}
        </div>
      </div>
      <p className="text-sm text-slate-700 mb-2">{s.summary}</p>
      {s.quotes.length > 0 && (
        <div className="space-y-1">
          {s.quotes.map((q, i) => (
            <blockquote
              key={i}
              className="border-l-4 border-slate-200 pl-3 text-xs text-slate-500 italic"
            >
              「{q}」
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────
// Page
// ──────────────────────────────────────────
export default async function MeetingDetailPage({ params }: Props) {
  const meeting = await getMeeting(params.id);
  if (!meeting) notFound();

  const summary = meeting.summary;
  const speakerSummaries = (summary?.speakerSummaries as SpeakerSummary[] | null) ?? [];
  const dateStr = meeting.date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <>
      <MeetingJsonLd meeting={meeting} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* パンくず */}
        <nav className="text-sm text-slate-400 mb-4">
          <Link href="/" className="hover:text-slate-600">
            ホーム
          </Link>{" "}
          /{" "}
          <Link href="/meetings" className="hover:text-slate-600">
            会議一覧
          </Link>{" "}
          / {meeting.nameOfMeeting}
        </nav>

        {/* ヘッダ */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <HouseBadge house={meeting.house} />
            <p className="text-sm text-slate-400">{dateStr}</p>
            {meeting.issue && (
              <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                {meeting.issue}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {meeting.nameOfMeeting}
          </h1>
          <div className="mt-3 flex gap-4 text-sm text-slate-500">
            <span>発言 {meeting.speeches.length} 件</span>
            <a
              href={meeting.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline hover:text-blue-800"
            >
              📄 一次情報を見る
            </a>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* メインカラム */}
          <div className="lg:col-span-2 space-y-6">
            {!summary ? (
              <div className="card text-center py-10">
                <p className="text-slate-400">要約を生成中です…</p>
              </div>
            ) : (
              <>
                {/* キートピック */}
                {summary.keyTopics.length > 0 && (
                  <Section title="キートピック" icon="🏷">
                    <div className="flex flex-wrap gap-2">
                      {summary.keyTopics.map((t) => (
                        <TopicTag key={t} tag={t} />
                      ))}
                    </div>
                  </Section>
                )}

                {/* 要約箇条書き */}
                <Section title="議事要約" icon="📋">
                  <div className="card">
                    <BulletList items={summary.bullets} color="blue" />
                  </div>
                </Section>

                {/* 合意事項 */}
                <Section title="合意・採決事項" icon="✅">
                  <div className="card">
                    <BulletList items={summary.agreementPoints} color="green" />
                  </div>
                </Section>

                {/* 対立点 */}
                <Section title="対立点・未解決事項" icon="⚖️">
                  <div className="card">
                    <BulletList items={summary.conflictPoints} color="red" />
                  </div>
                </Section>

                {/* 影響・注目点 */}
                <Section title="社会的影響・注目点" icon="🔍">
                  <div className="card">
                    <BulletList items={summary.impactNotes} color="amber" />
                  </div>
                </Section>

                {/* 一次情報リンク */}
                <SourceLinks links={summary.sourceLinks} />

                {/* モデル情報 */}
                <p className="text-xs text-slate-300">
                  要約モデル: {summary.modelUsed} /{" "}
                  更新: {summary.updatedAt.toLocaleDateString("ja-JP")}
                </p>
              </>
            )}

            {/* 発言者別サマリ */}
            {speakerSummaries.length > 0 && (
              <Section title={`発言者別サマリ（${speakerSummaries.length}名）`} icon="👥">
                <div className="grid gap-3 sm:grid-cols-2">
                  {speakerSummaries.map((s, i) => (
                    <SpeakerCard key={i} s={s} />
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* サイドバー: 発言一覧 (折りたたみ) */}
          <aside>
            <div className="card sticky top-20">
              <p className="font-semibold text-slate-700 mb-3">
                📜 発言一覧 ({meeting.speeches.length})
              </p>
              <div className="max-h-[500px] overflow-y-auto space-y-3 pr-1">
                {meeting.speeches.map((sp) => (
                  <div
                    key={sp.id}
                    className="border-b border-slate-100 pb-2 last:border-0"
                  >
                    <p className="text-xs font-medium text-slate-700">
                      {sp.speaker}
                      {sp.speakerGroup && (
                        <span className="text-slate-400 ml-1">
                          ({sp.speakerGroup})
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-3">
                      {sp.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
