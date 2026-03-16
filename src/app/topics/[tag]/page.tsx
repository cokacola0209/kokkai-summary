import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { SummaryCard, NoData } from "@/components/ui";
import Link from "next/link";

export const revalidate = 3600;

interface Props {
  params: { tag: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = decodeURIComponent(params.tag);
  return {
    title: `#${tag} の会議`,
    description: `「${tag}」タグが付いた国会会議録の一覧`,
  };
}

export default async function TopicPage({ params }: Props) {
  const tag = decodeURIComponent(params.tag);

  const summaries = await prisma.summary.findMany({
    where: {
      keyTopics: { has: tag },
    },
    include: {
      meeting: true,
    },
    orderBy: {
      meeting: { date: "desc" },
    },
    take: 50,
  });

  const meetings = summaries.map((s) => ({
    ...s.meeting,
    summary: { bullets: s.bullets, keyTopics: s.keyTopics },
  }));

  // 関連タグ
  const relatedTagCounts = new Map<string, number>();
  for (const s of summaries) {
    for (const t of s.keyTopics) {
      if (t !== tag) {
        relatedTagCounts.set(t, (relatedTagCounts.get(t) ?? 0) + 1);
      }
    }
  }
  const relatedTags = Array.from(relatedTagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([t]) => t);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* パンくず */}
      <nav className="text-sm text-slate-400 mb-4">
        <Link href="/" className="hover:text-slate-600 transition">
          ホーム
        </Link>{" "}
        /{" "}
        <span className="text-slate-600">#{tag}</span>
      </nav>

      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        <span className="text-blue-500">#</span>
        {tag}
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        {meetings.length} 件の会議でこのトピックが議題に上がっています
      </p>

      {/* 関連タグ */}
      {relatedTags.length > 0 && (
        <div className="mb-8">
          <p className="text-xs text-slate-400 mb-2 font-medium">
            関連トピック
          </p>
          <div className="flex flex-wrap gap-2">
            {relatedTags.map((t) => (
              <Link
                key={t}
                href={`/topics/${encodeURIComponent(t)}`}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                #{t}
              </Link>
            ))}
          </div>
        </div>
      )}

      {meetings.length === 0 ? (
        <NoData
          message={`「${tag}」に関する会議が見つかりませんでした。`}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {meetings.map((m) => (
            <SummaryCard
              key={m.id}
              id={m.id}
              date={m.date.toLocaleDateString("ja-JP")}
              house={m.house}
              nameOfMeeting={m.nameOfMeeting}
              bullets={m.summary.bullets}
              keyTopics={m.summary.keyTopics}
            />
          ))}
        </div>
      )}
    </div>
  );
}
