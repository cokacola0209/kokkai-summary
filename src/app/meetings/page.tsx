import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SummaryCard, NoData, DateGroupHeader } from "@/components/ui";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "会議一覧",
  description: "国会会議録の日付順一覧。各会議の要約・発言者別サマリを掲載。",
};

const PAGE_SIZE = 30;

interface SearchParams {
  page?: string;
  house?: string;
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const house = searchParams.house;

  const where = house ? { house } : {};

  const [total, meetings] = await Promise.all([
    prisma.meeting.count({ where }),
    prisma.meeting.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        summary: { select: { bullets: true, keyTopics: true } },
        _count: { select: { speeches: true } },
      },
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // 院フィルタ用
  const houses = await prisma.meeting.groupBy({
    by: ["house"],
    _count: true,
    orderBy: { _count: { house: "desc" } },
  });

  // 日付ごとにグループ化
  const dateGroups = new Map<string, typeof meetings>();
  for (const m of meetings) {
    const dateKey = m.date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
    if (!dateGroups.has(dateKey)) {
      dateGroups.set(dateKey, []);
    }
    dateGroups.get(dateKey)!.push(m);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* ヘッダ */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">会議一覧</h1>
        <p className="text-sm text-slate-500">
          全 {total.toLocaleString()} 件の会議録
          {house && <span> — {house}で絞り込み中</span>}
        </p>
      </div>

      {/* フィルタ */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <span className="text-xs text-slate-400 mr-1">絞り込み:</span>
        <FilterLink label="すべて" href="/meetings" active={!house} />
        {houses.map((h) => (
          <FilterLink
            key={h.house}
            label={`${h.house} (${h._count})`}
            href={`/meetings?house=${encodeURIComponent(h.house)}`}
            active={house === h.house}
          />
        ))}
      </div>

      {meetings.length === 0 ? (
        <NoData message="会議データがありません。" />
      ) : (
        <>
          {/* 日付ごとにグループ表示 */}
          <div className="space-y-2">
            {Array.from(dateGroups.entries()).map(([dateKey, groupMeetings]) => (
              <div key={dateKey}>
                <DateGroupHeader date={dateKey} count={groupMeetings.length} />
                <div className="grid gap-4 sm:grid-cols-2 ml-0 sm:ml-6 mb-6">
                  {groupMeetings.map((m) => (
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
              </div>
            ))}
          </div>

          {/* ページネーション */}
          <nav className="mt-10 flex items-center justify-center gap-2">
            {page > 1 && (
              <PaginationLink
                href={`/meetings?page=${page - 1}${house ? `&house=${house}` : ""}`}
                label="← 前へ"
              />
            )}
            <span className="px-4 py-2 text-sm text-slate-500 font-medium">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <PaginationLink
                href={`/meetings?page=${page + 1}${house ? `&house=${house}` : ""}`}
                label="次へ →"
              />
            )}
          </nav>
        </>
      )}
    </div>
  );
}

function FilterLink({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-sm transition-all duration-150 ${
        active
          ? "bg-[#1a2744] text-white shadow-sm"
          : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );
}

function PaginationLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-slate-200 px-5 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-all duration-150"
    >
      {label}
    </Link>
  );
}
