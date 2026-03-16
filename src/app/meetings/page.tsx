import type { Metadata } from "next";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { MeetingListCard, NoData, DateGroupHeader } from "@/components/ui";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "会議一覧",
  description:
    "国会会議録の日付順一覧。テーマ・人物・委員会・院で絞り込みながら要点を見やすく確認できます。",
};

const PAGE_SIZE = 30;

interface SearchParams {
  page?: string | string[];
  house?: string | string[];
  topic?: string | string[];
  person?: string | string[];
  committee?: string | string[];
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
  page?: string;
}) {
  const qs = new URLSearchParams();

  if (params.house) qs.set("house", params.house);
  if (params.topic) qs.set("topic", params.topic);
  if (params.person) qs.set("person", params.person);
  if (params.committee) qs.set("committee", params.committee);
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
  return speaker
    .replace(/^[○〇]\s*/, "")
    .replace(/君$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulSpeakerName(name: string): boolean {
  if (!name) return false;
  if (name.length > 20) return false;

  const blocked = new Set([
    "委員長",
    "理事",
    "議長",
    "副議長",
    "会長",
    "参考人",
    "政府参考人",
    "公述人",
    "説明員",
    "事務局",
  ]);

  return !blocked.has(name);
}

async function getFilterOptions() {
  const filterSourceMeetings = await prisma.meeting.findMany({
    orderBy: { date: "desc" },
    take: 160,
    include: {
      summary: {
        select: {
          keyTopics: true,
        },
      },
      speeches: {
        select: {
          speaker: true,
        },
        orderBy: { order: "asc" },
        take: 20,
      },
    },
  });

  const topicCounts = new Map<string, number>();
  const personCounts = new Map<string, number>();
  const committeeCounts = new Map<string, number>();

  for (const meeting of filterSourceMeetings) {
    const topics = Array.from(new Set(meeting.summary?.keyTopics ?? []));
    for (const topic of topics) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }

    const committee = getCommitteeLabel(meeting.nameOfMeeting);
    if (committee) {
      committeeCounts.set(committee, (committeeCounts.get(committee) ?? 0) + 1);
    }

    const speakers = new Set(
      meeting.speeches
        .map((speech) => normalizeSpeakerName(speech.speaker))
        .filter(isUsefulSpeakerName)
    );

    speakers.forEach((speaker) => {
      personCounts.set(speaker, (personCounts.get(speaker) ?? 0) + 1);
    });
  }

  const topicOptions = Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([label]) => label);

  const personOptions = Array.from(personCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([label]) => label);

  const committeeOptions = Array.from(committeeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([label]) => label);

  return {
    topicOptions,
    personOptions,
    committeeOptions,
  };
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const page = Math.max(1, Number(getSingleParam(searchParams.page) ?? 1));
  const house = getSingleParam(searchParams.house);
  const topic = getSingleParam(searchParams.topic);
  const person = getSingleParam(searchParams.person);
  const committee = getSingleParam(searchParams.committee);

  const where: Prisma.MeetingWhereInput = {
    AND: [
      house ? { house } : {},
      topic
        ? {
            summary: {
              is: {
                keyTopics: {
                  has: topic,
                },
              },
            },
          }
        : {},
      person
        ? {
            speeches: {
              some: {
                speaker: {
                  contains: person,
                  mode: "insensitive",
                },
              },
            },
          }
        : {},
      committee
        ? committee === "本会議"
          ? {
              nameOfMeeting: {
                contains: "本会議",
                mode: "insensitive",
              },
            }
          : {
              nameOfMeeting: {
                contains: committee,
                mode: "insensitive",
              },
            }
        : {},
    ],
  };

  const [total, meetings, houses, filterOptions] = await Promise.all([
    prisma.meeting.count({ where }),
    prisma.meeting.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        summary: {
          select: {
            agreementPoints: true,
            conflictPoints: true,
            keyTopics: true,
          },
        },
      },
    }),
    prisma.meeting.groupBy({
      by: ["house"],
      _count: true,
      orderBy: { _count: { house: "desc" } },
    }),
    getFilterOptions(),
  ]);

　
  const activeFilterCount = [house, topic, person, committee].filter(Boolean).length;
  const hasActiveFilters = activeFilterCount > 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

  const dateEntries = Array.from(dateGroups.entries());

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* ヘッダ */}
      <div className="mb-6">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">会議一覧</h1>
        <p className="text-sm text-slate-500">
          全 {total.toLocaleString()} 件の会議録
          {hasActiveFilters && <span> — 条件で絞り込み中</span>}
        </p>
        <p className="mt-2 text-sm text-slate-400">
          会議名 → 何が決まったか → 主な争点 → タグ の順で、ざっと比較できます。
        </p>
      </div>

      {/* 絞り込みエリア */}
      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              絞り込み
            </p>
            <p className="mt-1 text-xs text-slate-500">
              院・テーマ・人物・委員会で絞り込めます。
            </p>
          </div>

          {hasActiveFilters && (
            <Link
              href="/meetings"
              className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              すべて解除
            </Link>
          )}
        </div>

        {hasActiveFilters && (
          <div className="mt-4 flex flex-wrap gap-2">
            {house && (
              <ActiveFilterChip
                label={`院: ${house}`}
                href={buildMeetingsHref({
                  topic,
                  person,
                  committee,
                })}
              />
            )}
            {topic && (
              <ActiveFilterChip
                label={`テーマ: ${topic}`}
                href={buildMeetingsHref({
                  house,
                  person,
                  committee,
                })}
              />
            )}
            {person && (
              <ActiveFilterChip
                label={`人物: ${person}`}
                href={buildMeetingsHref({
                  house,
                  topic,
                  committee,
                })}
              />
            )}
            {committee && (
              <ActiveFilterChip
                label={`委員会: ${committee}`}
                href={buildMeetingsHref({
                  house,
                  topic,
                  person,
                })}
              />
            )}
          </div>
        )}

<details className="mt-3" open={hasActiveFilters}>
<summary className="flex cursor-pointer list-none justify-end">
  <span className="text-xs font-medium text-blue-600 hover:text-blue-700">
    開く / 閉じる
  </span>
</summary>

<div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
    <div className="space-y-5">
      <FilterGroup title="院">
        <FilterLink
          label="すべて"
          href={buildMeetingsHref({
            topic,
            person,
            committee,
          })}
          active={!house}
        />
        {houses.map((h) => (
          <FilterLink
            key={h.house}
            label={`${h.house} (${h._count})`}
            href={buildMeetingsHref({
              house: h.house,
              topic,
              person,
              committee,
            })}
            active={house === h.house}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="テーマ">
        <FilterLink
          label="指定なし"
          href={buildMeetingsHref({
            house,
            person,
            committee,
          })}
          active={!topic}
        />
        {filterOptions.topicOptions.map((item) => (
          <FilterLink
            key={item}
            label={item}
            href={buildMeetingsHref({
              house,
              topic: item,
              person,
              committee,
            })}
            active={topic === item}
          />
        ))}
      </FilterGroup>

      <FilterGroup
        title="人物"
        action={
          <Link
            href="/people"
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            人物一覧を見る →
          </Link>
        }
      >
        <FilterLink
          label="指定なし"
          href={buildMeetingsHref({
            house,
            topic,
            committee,
          })}
          active={!person}
        />
        {filterOptions.personOptions.map((item) => (
          <FilterLink
            key={item}
            label={item}
            href={buildMeetingsHref({
              house,
              topic,
              person: item,
              committee,
            })}
            active={person === item}
          />
        ))}
      </FilterGroup>

      <FilterGroup title="委員会">
        <FilterLink
          label="指定なし"
          href={buildMeetingsHref({
            house,
            topic,
            person,
          })}
          active={!committee}
        />
        {filterOptions.committeeOptions.map((item) => (
          <FilterLink
            key={item}
            label={item}
            href={buildMeetingsHref({
              house,
              topic,
              person,
              committee: item,
            })}
            active={committee === item}
          />
        ))}
      </FilterGroup>
    </div>
  </div>
</details>


        </div>


        {meetings.length === 0 ? (
  <div className="rounded-2xl border border-slate-200 bg-white p-6">
    <NoData message="条件に合う会議データがありません。" />

    <div className="mt-4 flex flex-wrap gap-2">
      {hasActiveFilters && (
        <Link
          href="/meetings"
          className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
        >
          絞り込みをリセット
        </Link>
      )}

      {house && (
        <Link
          href={buildMeetingsHref({ topic, person, committee })}
          className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-100"
        >
          院を外す
        </Link>
      )}

      {topic && (
        <Link
          href={buildMeetingsHref({ house, person, committee })}
          className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-100"
        >
          テーマを外す
        </Link>
      )}

      {person && (
        <Link
          href={buildMeetingsHref({ house, topic, committee })}
          className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-100"
        >
          人物を外す
        </Link>
      )}

      {committee && (
        <Link
          href={buildMeetingsHref({ house, topic, person })}
          className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-100"
        >
          委員会を外す
        </Link>
      )}

      <Link
        href="/"
        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      >
        今日の会議を見る
      </Link>

      <Link
        href="/people"
        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      >
        人物一覧を見る
      </Link>
    </div>
  </div>
) : (
  <>
    {/* 日付ごとにグループ表示 */}
    <div className="space-y-2">
  {dateEntries.map(([dateKey, groupMeetings], index) => {
    const compactLabels = Array.from(
      new Set(groupMeetings.map((m) => getCompactMeetingLabel(m.nameOfMeeting)))
    );

    const visibleLabels = compactLabels.slice(0, 4);
    const hiddenLabelCount = Math.max(0, compactLabels.length - visibleLabels.length);

    if (index < 2) {
      return (
        <div key={dateKey}>
          <DateGroupHeader date={dateKey} count={groupMeetings.length} />
          <div className="mb-6 ml-0 grid gap-4 sm:ml-6 sm:grid-cols-2">
            {groupMeetings.map((m) => (
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
        </div>
      );
    }

    return (
      <details
        key={dateKey}
        className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white"
      >
        <summary className="list-none cursor-pointer px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-slate-800">{dateKey}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {groupMeetings.length}件
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {visibleLabels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600"
                  >
                    {label}
                  </span>
                ))}

                {hiddenLabelCount > 0 && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                    +{hiddenLabelCount}
                  </span>
                )}
              </div>
            </div>

            <span className="shrink-0 text-xs font-medium text-blue-600">
              開く / 閉じる
            </span>
          </div>
        </summary>

        <div className="border-t border-slate-100 px-4 pb-4 pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {groupMeetings.map((m) => (
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
        </div>
      </details>
    );
  })}
</div>

          {/* ページネーション */}
          <nav className="mt-10 flex items-center justify-center gap-2">
            {page > 1 && (
              <PaginationLink
                href={buildMeetingsHref({
                  house,
                  topic,
                  person,
                  committee,
                  page: String(page - 1),
                })}
                label="← 前へ"
              />
            )}
            <span className="px-4 py-2 text-sm font-medium text-slate-500">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <PaginationLink
                href={buildMeetingsHref({
                  house,
                  topic,
                  person,
                  committee,
                  page: String(page + 1),
                })}
                label="次へ →"
              />
            )}
          </nav>
        </>
      )}
    </div>
  );
}

function FilterGroup({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-slate-500">
          {title}
        </p>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
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
          : "border border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );
}

function ActiveFilterChip({
  label,
  href,
}: {
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200"
    >
      {label} ×
    </Link>
  );
}

function PaginationLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-slate-200 px-5 py-2 text-sm text-slate-700 transition-all duration-150 hover:border-slate-300 hover:bg-slate-100"
    >
      {label}
    </Link>
  );
}
