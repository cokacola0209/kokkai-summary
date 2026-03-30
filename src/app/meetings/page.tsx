import type { Metadata } from "next";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { MeetingListCard, NoData, DateGroupHeader } from "@/components/ui";
import { AccordionDetails } from "@/components/Accordion";

// ✅ 変更①: force-dynamic を削除し revalidate=60 に統一
// force-dynamic があると revalidate が無視され毎回DBを叩く。
// 60秒キャッシュにすることで同一期間のリクエストをまとめられる。
export const revalidate = 60;

export const metadata: Metadata = {
  title: "会議一覧",
  description:
    "国会会議録の日付順一覧。テーマ・人物・委員会・院・会派・期間で絞り込みながら要点を見やすく確認できます。",
};

// ✅ 変更②: PAGE_SIZE を 200 → 15 に削減
// 200件は1クエリで大量データを転送しDBへの負荷も高い。
// 15件ならネットワーク転送量・メモリ使用量ともに約13分の1になる。
const PAGE_SIZE = 15;

interface SearchParams {
  page?: string | string[];
  house?: string | string[];
  topic?: string | string[];
  person?: string | string[];
  committee?: string | string[];
  party?: string | string[];
  year?: string | string[];
  month?: string | string[];
}

function getSingleParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
function getCompactMeetingLabel(nameOfMeeting: string): string {
  if (nameOfMeeting.includes("本会議")) return "本会議";
  const committeeMatch = nameOfMeeting.match(/[^\s　、]+委員会/);
  if (committeeMatch) return committeeMatch[0];
  const reviewMatch = nameOfMeeting.match(/[^\s　、]+審査会/);
  if (reviewMatch) return reviewMatch[0];
  const researchMatch = nameOfMeeting.match(/[^\s　、]+調査会/);
  if (researchMatch) return researchMatch[0];
  return nameOfMeeting.replace(/\s+/g, " ").trim();
}
function buildMeetingsHref(params: {
  house?: string;
  topic?: string;
  person?: string;
  committee?: string;
  party?: string;
  year?: string;
  month?: string;
  page?: string;
}) {
  const qs = new URLSearchParams();
  if (params.house) qs.set("house", params.house);
  if (params.topic) qs.set("topic", params.topic);
  if (params.person) qs.set("person", params.person);
  if (params.committee) qs.set("committee", params.committee);
  if (params.party) qs.set("party", params.party);
  if (params.year) qs.set("year", params.year);
  if (params.month) qs.set("month", params.month);
  if (params.page) qs.set("page", params.page);
  const query = qs.toString();
  return query ? `/meetings?${query}` : "/meetings";
}

function getCommitteeLabel(nameOfMeeting: string): string | null {
  if (nameOfMeeting.includes("本会議")) return "本会議";
  const committeeMatch = nameOfMeeting.match(/[^\s　、]+委員会/);
  if (committeeMatch) return committeeMatch[0];
  const reviewMatch = nameOfMeeting.match(/[^\s　、]+審査会/);
  if (reviewMatch) return reviewMatch[0];
  const researchMatch = nameOfMeeting.match(/[^\s　、]+調査会/);
  if (researchMatch) return researchMatch[0];
  return null;
}

function normalizeSpeakerName(speaker: string): string {
  return speaker.replace(/^[○〇]\s*/, "").replace(/君$/, "").replace(/\s+/g, " ").trim();
}

function isUsefulSpeakerName(name: string): boolean {
  if (!name) return false;
  if (name.length > 20) return false;
  const blocked = new Set([
    "委員長", "理事", "議長", "副議長", "会長",
    "参考人", "政府参考人", "公述人", "説明員", "事務局", "会議録情報",
  ]);
  return !blocked.has(name);
}

// ✅ 変更③: getFilterOptions を unstable_cache でラップ（1時間キャッシュ）
// 160件 + speeches JOIN は重い。フィルター選択肢は1時間で十分新鮮。
// Vercel の Data Cache に乗るのでDBへのアクセスが激減する。
const getFilterOptions = unstable_cache(
  async () => {
    const filterSourceMeetings = await prisma.meeting.findMany({
      orderBy: { date: "desc" },
      take: 160,
      include: {
        summary: { select: { keyTopics: true } },
        speeches: { select: { speaker: true }, orderBy: { order: "asc" }, take: 20 },
      },
    });

    const topicCounts = new Map<string, number>();
    const personCounts = new Map<string, number>();
    const committeeCounts = new Map<string, number>();

    for (const meeting of filterSourceMeetings) {
      for (const topic of Array.from(new Set(meeting.summary?.keyTopics ?? []))) {
        topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      }
      const committee = getCommitteeLabel(meeting.nameOfMeeting);
      if (committee) {
        committeeCounts.set(committee, (committeeCounts.get(committee) ?? 0) + 1);
      }
      const speakers = new Set(
        meeting.speeches.map((s) => normalizeSpeakerName(s.speaker)).filter(isUsefulSpeakerName)
      );
      speakers.forEach((speaker) => {
        personCounts.set(speaker, (personCounts.get(speaker) ?? 0) + 1);
      });
    }

    const topicOptions = Array.from(topicCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([l]) => l);
    const personOptions = Array.from(personCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([l]) => l);
    const committeeOptions = Array.from(committeeCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([l]) => l);

    const parties = await prisma.party.findMany({
      where: { speeches: { some: {} } },
      select: { id: true, shortName: true, color: true, _count: { select: { speeches: true } } },
      orderBy: { name: "asc" },
    });
    const partyOptions = parties
      .sort((a, b) => b._count.speeches - a._count.speeches)
      .map((p) => ({ id: p.id, shortName: p.shortName, color: p.color }));

    return { topicOptions, personOptions, committeeOptions, partyOptions };
  },
  ["filter-options"],
  { revalidate: 3600 } // 1時間キャッシュ
);

// ✅ 変更④: getAvailableYearMonths を unstable_cache でラップ（1時間キャッシュ）
// 全件 date を読む全走査は重い。年月の選択肢は1時間単位で十分。
const getAvailableYearMonths = unstable_cache(
  async () => {
    const meetings = await prisma.meeting.findMany({
      select: { date: true },
    });

    const years = new Map<number, { months: { month: number; count: number }[]; total: number }>();
    for (const m of meetings) {
      const y = m.date.getFullYear();
      const mo = m.date.getMonth() + 1;
      if (!years.has(y)) {
        years.set(y, { months: [], total: 0 });
      }
      const entry = years.get(y)!;
      entry.total++;
      const existing = entry.months.find((x) => x.month === mo);
      if (existing) {
        existing.count++;
      } else {
        entry.months.push({ month: mo, count: 1 });
      }
    }

    for (const entry of Array.from(years.values())) {
      entry.months.sort((a, b) => b.month - a.month);
    }

    // unstable_cache は JSON シリアライズするため Map は壊れる。
    // plain object に変換して返す。
    return Object.fromEntries(years);
  },
  ["available-year-months"],
  { revalidate: 3600 } // 1時間キャッシュ
);

// ✅ 変更⑤: getTodayMeetings を unstable_cache でラップ（5分キャッシュ）
// 「直近の会議」は頻繁に変わらない。5分キャッシュで十分実用的。
const getTodayMeetings = unstable_cache(
  async () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    return prisma.meeting.findMany({
      where: { date: { gte: todayStart, lt: todayEnd } },
      orderBy: { nameOfMeeting: "asc" },
      include: {
        summary: {
          select: { agreementPoints: true, conflictPoints: true, keyTopics: true },
        },
      },
    });
  },
  ["today-meetings"],
  { revalidate: 300 } // 5分キャッシュ
);

export default async function MeetingsPage({ searchParams }: { searchParams: SearchParams }) {
  const page = Math.max(1, Number(getSingleParam(searchParams.page) ?? 1));
  const house = getSingleParam(searchParams.house);
  const topic = getSingleParam(searchParams.topic);
  const person = getSingleParam(searchParams.person);
  const committee = getSingleParam(searchParams.committee);
  const party = getSingleParam(searchParams.party);
  const year = getSingleParam(searchParams.year);
  const month = getSingleParam(searchParams.month);

  let dateFilter: Prisma.MeetingWhereInput = {};
  if (year) {
    const y = Number(year);
    if (month) {
      const m = Number(month);
      dateFilter = {
        date: {
          gte: new Date(y, m - 1, 1),
          lt: new Date(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1),
        },
      };
    } else {
      dateFilter = {
        date: {
          gte: new Date(y, 0, 1),
          lt: new Date(y + 1, 0, 1),
        },
      };
    }
  }

  const where: Prisma.MeetingWhereInput = {
    AND: [
      house ? { house } : {},
      topic ? { summary: { is: { keyTopics: { has: topic } } } } : {},
      person ? { speeches: { some: { speaker: { contains: person, mode: "insensitive" } } } } : {},
      committee
        ? committee === "本会議"
          ? { nameOfMeeting: { contains: "本会議", mode: "insensitive" } }
          : { nameOfMeeting: { contains: committee, mode: "insensitive" } }
        : {},
      party ? { speeches: { some: { partyId: party } } } : {},
      dateFilter,
    ],
  };

  // 直列実行: connection_limit=1 環境では同時的な DB 要求が
  // 接続競合を悪化させる可能性が高いため、Promise.all をやめて直列 await にする。
  const totalAll = await prisma.meeting.count();
  const total = await prisma.meeting.count({ where });
  const meetings = await prisma.meeting.findMany({
    where,
    orderBy: { date: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { summary: { select: { agreementPoints: true, conflictPoints: true, keyTopics: true } } },
  });

  const houses = await prisma.meeting.groupBy({
    by: ["house"],
    _count: true,
    orderBy: { _count: { house: "desc" } },
  });

  // キャッシュ済み関数を並列実行（DBは叩かずキャッシュから返る）
  const [filterOptions, yearMonths, todayMeetings] = await Promise.all([
    getFilterOptions(),
    getAvailableYearMonths(),
    getTodayMeetings(),
  ]);

  const activePartyLabel = party
    ? filterOptions.partyOptions.find((p) => p.id === party)?.shortName ?? "会派"
    : null;

  const activeFilterCount = [house, topic, person, committee, party, year].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const dateGroups = new Map<string, typeof meetings>();
  for (const m of meetings) {
    const dateKey = m.date.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
    if (!dateGroups.has(dateKey)) dateGroups.set(dateKey, []);
    dateGroups.get(dateKey)!.push(m);
  }
  const dateEntries = Array.from(dateGroups.entries());

  const monthLabel = month ? `${month}月` : null;
  const yearLabel = year ? `${year}年` : null;
  const periodLabel = yearLabel && monthLabel ? `${yearLabel}${monthLabel}` : yearLabel ?? null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">会議一覧</h1>
        <p className="text-sm text-slate-500">
          {hasActiveFilters
            ? `全 ${totalAll.toLocaleString()} 件中 ${total.toLocaleString()} 件に絞り込み中`
            : `全 ${total.toLocaleString()} 件の会議録`}
          {meetings.length < total && (
            <span className="ml-1 text-slate-400">
              （このページ: {meetings.length}件）
            </span>
          )}
        </p>
        <p className="mt-2 text-sm text-slate-400">
          会議名 → 何が決まったか → 主な争点 → タグ の順で、ざっと比較できます。
        </p>
      </div>

    {/* 絞り込みエリア */}
    <div id="filters" className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">会議検索・絞り込み</p>
            <p className="mt-1 text-xs text-slate-500">院・会派・テーマ・人物・委員会・期間で絞り込めます。</p>
          </div>
          {hasActiveFilters && (
            <Link href="/meetings" className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
              すべて解除
            </Link>
          )}
        </div>

        {hasActiveFilters && (
          <div className="mt-4 flex flex-wrap gap-2">
            {house && <ActiveFilterChip label={`院: ${house}`} href={buildMeetingsHref({ topic, person, committee, party, year, month })} />}
            {party && activePartyLabel && <ActiveFilterChip label={`会派: ${activePartyLabel}`} href={buildMeetingsHref({ house, topic, person, committee, year, month })} />}
            {topic && <ActiveFilterChip label={`テーマ: ${topic}`} href={buildMeetingsHref({ house, person, committee, party, year, month })} />}
            {person && <ActiveFilterChip label={`人物: ${person}`} href={buildMeetingsHref({ house, topic, committee, party, year, month })} />}
            {committee && <ActiveFilterChip label={`委員会: ${committee}`} href={buildMeetingsHref({ house, topic, person, party, year, month })} />}
            {periodLabel && <ActiveFilterChip label={`期間: ${periodLabel}`} href={buildMeetingsHref({ house, topic, person, committee, party })} />}
          </div>
        )}

        <details className="mt-3" open={hasActiveFilters}>
          <summary className="flex cursor-pointer list-none justify-end">
            <span className="text-xs font-medium text-blue-600 hover:text-blue-700">開く / 閉じる</span>
          </summary>

          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="space-y-5">
              {/* ── 期間 ── */}
              <FilterGroup title="期間">
                <FilterLink
                  label="すべて"
                  href={buildMeetingsHref({ house, topic, person, committee, party })}
                  active={!year}
                />
                {Object.entries(yearMonths).map(([y, data]) => (
                  <FilterLink
                    key={y}
                    label={`${y}年 (${data.total})`}
                    href={buildMeetingsHref({ house, topic, person, committee, party, year: String(y) })}
                    active={year === String(y) && !month}
                  />
                ))}
              </FilterGroup>

              {year && yearMonths[Number(year)] !== undefined && (
                <FilterGroup title={`${year}年の月別`}>
                  <FilterLink
                    label={`${year}年すべて`}
                    href={buildMeetingsHref({ house, topic, person, committee, party, year })}
                    active={!!year && !month}
                  />
                  {yearMonths[Number(year)]!.months.map(({ month: m, count }: { month: number; count: number }) => (
                    <FilterLink
                      key={m}
                      label={`${m}月 (${count})`}
                      href={buildMeetingsHref({ house, topic, person, committee, party, year, month: String(m) })}
                      active={month === String(m)}
                    />
                  ))}
                </FilterGroup>
              )}

              <FilterGroup title="院">
                <FilterLink label="すべて" href={buildMeetingsHref({ topic, person, committee, party, year, month })} active={!house} />
                {houses.map((h) => (
                  <FilterLink key={h.house} label={`${h.house} (${h._count})`} href={buildMeetingsHref({ house: h.house, topic, person, committee, party, year, month })} active={house === h.house} />
                ))}
              </FilterGroup>

              <FilterGroup title="会派">
                <FilterLink label="指定なし" href={buildMeetingsHref({ house, topic, person, committee, year, month })} active={!party} />
                {filterOptions.partyOptions.map((p) => (
                  <PartyFilterLink key={p.id} label={p.shortName} color={p.color} href={buildMeetingsHref({ house, topic, person, committee, party: p.id, year, month })} active={party === p.id} />
                ))}
              </FilterGroup>

              <FilterGroup title="テーマ">
                <FilterLink label="指定なし" href={buildMeetingsHref({ house, person, committee, party, year, month })} active={!topic} />
                {filterOptions.topicOptions.map((item) => (
                  <FilterLink key={item} label={item} href={buildMeetingsHref({ house, topic: item, person, committee, party, year, month })} active={topic === item} />
                ))}
              </FilterGroup>

              <FilterGroup title="人物" action={<Link href="/people" className="text-xs font-medium text-blue-600 hover:text-blue-700">人物一覧を見る →</Link>}>
                <FilterLink label="指定なし" href={buildMeetingsHref({ house, topic, committee, party, year, month })} active={!person} />
                {filterOptions.personOptions.map((item) => (
                  <FilterLink key={item} label={item} href={buildMeetingsHref({ house, topic, person: item, committee, party, year, month })} active={person === item} />
                ))}
              </FilterGroup>

              <FilterGroup title="委員会">
                <FilterLink label="指定なし" href={buildMeetingsHref({ house, topic, person, party, year, month })} active={!committee} />
                {filterOptions.committeeOptions.map((item) => (
                  <FilterLink key={item} label={item} href={buildMeetingsHref({ house, topic, person, committee: item, party, year, month })} active={committee === item} />
                ))}
              </FilterGroup>
            </div>
          </div>
        </details>
      </div>

 {/* ── 直近の会議 ── */}
 {page === 1 && !hasActiveFilters && (
        <div className="mb-8">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
            <span>📅</span> 直近の会議
          </h2>
          {todayMeetings.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {todayMeetings.map((m) => (
                <MeetingListCard
                  key={m.id}
                  id={m.id}
                  house={m.house}
                  nameOfMeeting={m.nameOfMeeting}
                  agreementPoints={m.summary?.agreementPoints ?? []}
                  conflictPoints={m.summary?.conflictPoints ?? []}
                  keyTopics={m.summary?.keyTopics ?? []}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
              <p className="text-sm text-slate-500">本日の会議はまだありません</p>
              <p className="mt-2 text-xs text-slate-400">
                下の「過去の会議を探す」から、これまでの会議を検索できます
              </p>
            </div>
          )}
        </div>
      )}

      {page === 1 && !hasActiveFilters && (
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
          <span>🔍</span> 過去の会議を探す
        </h2>
      )}

      {meetings.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <NoData message="条件に合う会議データがありません。" />
          <div className="mt-4 flex flex-wrap gap-2">
            {hasActiveFilters && (
              <Link href="/meetings" className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                絞り込みをリセット
              </Link>
            )}
            {house && <Link href={buildMeetingsHref({ topic, person, committee, party, year, month })} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-100">院を外す</Link>}
            {party && <Link href={buildMeetingsHref({ house, topic, person, committee, year, month })} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-100">会派を外す</Link>}
            {topic && <Link href={buildMeetingsHref({ house, person, committee, party, year, month })} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-100">テーマを外す</Link>}
            {person && <Link href={buildMeetingsHref({ house, topic, committee, party, year, month })} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-100">人物を外す</Link>}
            {committee && <Link href={buildMeetingsHref({ house, topic, person, party, year, month })} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-100">委員会を外す</Link>}
            {year && <Link href={buildMeetingsHref({ house, topic, person, committee, party })} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-100">期間を外す</Link>}
            <Link href="/" className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50">直近の会議を見る</Link>
            <Link href="/people" className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50">人物一覧を見る</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {dateEntries.map(([dateKey, groupMeetings]) => {
              const compactLabels = Array.from(new Set(groupMeetings.map((m) => getCompactMeetingLabel(m.nameOfMeeting))));
              const visibleLabels = compactLabels.slice(0, 4);
              const hiddenLabelCount = Math.max(0, compactLabels.length - visibleLabels.length);

              return (
                <AccordionDetails
                key={dateKey}
                title={dateKey}
                badge={`${groupMeetings.length}件`}
                subtitle={
                  <div className="flex flex-wrap gap-2">
                    {visibleLabels.map((label) => (
                      <span key={label} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">{label}</span>
                    ))}
                    {hiddenLabelCount > 0 && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">+{hiddenLabelCount}</span>
                    )}
                  </div>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  {groupMeetings.map((m) => (
                    <MeetingListCard key={m.id} id={m.id} house={m.house} nameOfMeeting={m.nameOfMeeting} agreementPoints={m.summary?.agreementPoints ?? []} conflictPoints={m.summary?.conflictPoints ?? []} keyTopics={m.summary?.keyTopics ?? []} />
                  ))}
                </div>
              </AccordionDetails>
              );
            })}
          </div>

          <nav className="mt-10 flex items-center justify-center gap-2">
            {page > 1 && <PaginationLink href={buildMeetingsHref({ house, topic, person, committee, party, year, month, page: String(page - 1) })} label="← 前へ" />}
            <span className="px-4 py-2 text-sm font-medium text-slate-500">{page} / {totalPages}</span>
            {page < totalPages && <PaginationLink href={buildMeetingsHref({ house, topic, person, committee, party, year, month, page: String(page + 1) })} label="次へ →" />}
          </nav>
        </>
      )}
    </div>
  );
}

function FilterGroup({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-slate-500">{title}</p>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FilterLink({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link href={href} className={`rounded-full px-3 py-1 text-sm transition-all duration-150 ${active ? "bg-[#1a2744] text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50"}`}>
      {label}
    </Link>
  );
}

function PartyFilterLink({ label, color, href, active }: { label: string; color: string; href: string; active: boolean }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-all duration-150 ${active ? "bg-[#1a2744] text-white shadow-sm" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50"}`}>
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: active ? "#fff" : color }} />
      {label}
    </Link>
  );
}

function ActiveFilterChip({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200">
      {label} ×
    </Link>
  );
}

function PaginationLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-lg border border-slate-200 px-5 py-2 text-sm text-slate-700 transition-all duration-150 hover:border-slate-300 hover:bg-slate-100">
      {label}
    </Link>
  );
}
