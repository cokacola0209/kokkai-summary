// src/app/meetings/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SummaryCard, NoData } from "@/components/ui";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "会議一覧",
  description: "国会会議録の日付順一覧。各会議の要約・発言者別サマリを掲載。",
};

const PAGE_SIZE = 20;

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

  // 院フィルタ用のユニーク一覧
  const houses = await prisma.meeting.groupBy({
    by: ["house"],
    _count: true,
    orderBy: { _count: { house: "desc" } },
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">会議一覧</h1>
      <p className="text-sm text-slate-500 mb-6">
        全 {total.toLocaleString()} 件 / {totalPages} ページ
      </p>

      {/* フィルタ */}
      <div className="flex flex-wrap gap-2 mb-6">
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
          <div className="grid gap-4 sm:grid-cols-2">
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

          {/* ページネーション */}
          <div className="mt-8 flex justify-center gap-2">
            {page > 1 && (
              <PaginationLink
                href={`/meetings?page=${page - 1}${house ? `&house=${house}` : ""}`}
                label="← 前へ"
              />
            )}
            <span className="px-4 py-2 text-sm text-slate-500">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <PaginationLink
                href={`/meetings?page=${page + 1}${house ? `&house=${house}` : ""}`}
                label="次へ →"
              />
            )}
          </div>
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
      className={`rounded-full px-3 py-1 text-sm transition ${
        active
          ? "bg-[#1a2744] text-white"
          : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
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
      className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 transition"
    >
      {label}
    </Link>
  );
}
