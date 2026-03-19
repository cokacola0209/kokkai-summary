import type { Metadata } from "next";
import Link from "next/link";
import { AccordionDetails } from "@/components/Accordion";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  SummaryCard,
  Section,
  TopicTag,
  StatCard,
  HouseBadge,
} from "@/components/ui";
import { EditorNoteCard } from "@/components/EditorNoteCard";

export const dynamic = "force-dynamic";

// ──────────────────────────────────────────
// Params
// ──────────────────────────────────────────

interface Props {
  params: { date: string }; // "2026-03-10"
}

// ──────────────────────────────────────────
// 日付パース（タイムゾーンずれ防止）
// ──────────────────────────────────────────

function parseDate(dateStr: string): Date | null {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

// ──────────────────────────────────────────
// SEO
// ──────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const date = parseDate(params.date);
  if (!date) return { title: "日付が不正です" };

  const dateStr = date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    title: `${dateStr}の国会3分まとめ – 国会ラボ`,
    description: `${dateStr}の国会審議をAIが3分で要約。根拠・影響・未解決点を構造化表示。`,
    openGraph: {
      title: `${dateStr}の国会3分まとめ`,
      description: `${dateStr}の国会審議をAIが要約`,
    },
  };
}

// ──────────────────────────────────────────
// データ取得
// ──────────────────────────────────────────

async function getMeetingsByDate(date: Date) {
  return prisma.meeting.findMany({
    where: { date },
    orderBy: { nameOfMeeting: "asc" },
    include: {
      summary: true,
      _count: { select: { speeches: true } },
    },
  });
}

async function getEditorNote(date: Date) {
  return prisma.dailyEditorNote.findUnique({
    where: { targetDate: date },
  });
}

// 前後の日のまとめへのナビゲーション
async function getAdjacentDates(date: Date) {
  const [prev, next] = await Promise.all([
    prisma.meeting.findFirst({
      where: { date: { lt: date } },
      orderBy: { date: "desc" },
      select: { date: true },
    }),
    prisma.meeting.findFirst({
      where: { date: { gt: date } },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
  ]);

  return {
    prevDate: prev?.date ?? null,
    nextDate: next?.date ?? null,
  };
}

// 勢力図（トップページと同じ）
async function getPartyBalance() {
  const seats = await prisma.partySeat.findMany({
    orderBy: [{ house: "asc" }, { seats: "desc" }],
    include: {
      party: { select: { shortName: true, color: true } },
    },
  });

  const byHouse = new Map<string, typeof seats>();
  for (const s of seats) {
    if (!byHouse.has(s.house)) byHouse.set(s.house, []);
    byHouse.get(s.house)!.push(s);
  }

  const result: Array<{
    house: string;
    totalSeats: number;
    majority: number;
    parties: Array<{ shortName: string; color: string; seats: number; pct: number }>;
  }> = [];

  for (const [house, houseSeats] of Array.from(byHouse)) {
    const latestAsOf = houseSeats.reduce(
      (max, s) => (s.asOf.getTime() > max.getTime() ? s.asOf : max),
      houseSeats[0].asOf
    );
    const latestSeats = houseSeats
      .filter((s) => s.asOf.getTime() === latestAsOf.getTime())
      .sort((a, b) => b.seats - a.seats);
    const totalSeats = house === "衆議院" ? 465 : 248;
    const majority = Math.floor(totalSeats / 2) + 1;

    result.push({
      house,
      totalSeats,
      majority,
      parties: latestSeats.map((s) => ({
        shortName: s.party.shortName,
        color: s.party.color,
        seats: s.seats,
        pct: Math.round((s.seats / totalSeats) * 100),
      })),
    });
  }

  result.sort((a, b) => (a.house === "衆議院" ? -1 : 1));
  return result;
}

// ──────────────────────────────────────────
// 集計ユーティリティ
// ──────────────────────────────────────────

type MeetingWithSummary = Awaited<ReturnType<typeof getMeetingsByDate>>;

function aggregateTopics(meetings: MeetingWithSummary): string[] {
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

function aggregateHighlights(meetings: MeetingWithSummary) {
  const items: Array<{ text: string; meeting: string; type: "conflict" | "impact" }> = [];
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

function aggregateAgreements(meetings: MeetingWithSummary) {
  return meetings.flatMap((m) =>
    (m.summary?.agreementPoints ?? []).map((a) => ({
      text: a,
      meeting: m.nameOfMeeting,
    }))
  );
}

// ──────────────────────────────────────────
// JSON-LD
// ──────────────────────────────────────────

function DailyJsonLd({ date, meetingCount }: { date: Date; meetingCount: number }) {
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
// 勢力図コンポーネント（トップページと同じ）
// ──────────────────────────────────────────

function PartyBalanceChart({
  balanceData,
}: {
  balanceData: Awaited<ReturnType<typeof getPartyBalance>>;
}) {
  if (balanceData.length === 0) return null;

  return (
    <div className="card">
      <p className="mb-1 font-semibold text-slate-700">🏛 国会の勢力図</p>
      <p className="mb-4 text-xs text-slate-400">各会派の議席数（過半数ラインつき）</p>

      <div className="space-y-5">
        {balanceData.map((house) => (
          <div key={house.house}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                {house.house}
                <span className="ml-1 text-xs font-normal text-slate-400">
                  （定数{house.totalSeats}）
                </span>
              </p>
              <span className="text-xs text-slate-400">過半数 {house.majority}</span>
            </div>
            <div className="relative mb-2">
              <div className="flex h-5 overflow-hidden rounded-full bg-slate-100">
                {house.parties.map((p, i) => (
                  <div
                    key={i}
                    className="transition-all duration-300"
                    style={{
                      width: `${(p.seats / house.totalSeats) * 100}%`,
                      backgroundColor: p.color,
                    }}
                    title={`${p.shortName}: ${p.seats}席（${p.pct}%）`}
                  />
                ))}
              </div>
              <div
                className="absolute top-0 h-5 border-r-2 border-dashed border-slate-900/30"
                style={{ left: `${(house.majority / house.totalSeats) * 100}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {house.parties.map((p, i) => (
                <span key={i} className="flex items-center gap-1 text-[11px] text-slate-600">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.shortName}
                  <span className="text-slate-400">{p.seats}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// ページ本体
// ──────────────────────────────────────────

export default async function DailyDetailPage({ params }: Props) {
  const date = parseDate(params.date);
  if (!date) notFound();

  const meetings = await getMeetingsByDate(date);
  if (meetings.length === 0) notFound();

  const [editorNote, adjacentDates, partyBalance] = await Promise.all([
    getEditorNote(date),
    getAdjacentDates(date),
    getPartyBalance(),
  ]);

  const dateStr = date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const topTopics = aggregateTopics(meetings);
  const highlights = aggregateHighlights(meetings);
  const agreements = aggregateAgreements(meetings);

  const meetingsWithSummary = meetings.filter((m) => m.summary);
  const totalSpeeches = meetings.reduce((s, m) => s + m._count.speeches, 0);
  const topHighlights = highlights.slice(0, 3);
  const topAgreements = agreements.slice(0, 4);

  const prevDateStr = adjacentDates.prevDate?.toISOString().slice(0, 10) ?? null;
  const nextDateStr = adjacentDates.nextDate?.toISOString().slice(0, 10) ?? null;

  return (
    <>
      <DailyJsonLd date={date} meetingCount={meetings.length} />

      <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
        {/* パンくず */}
        <nav className="mb-4 text-sm text-slate-400">
          <Link href="/" className="transition hover:text-slate-600">
            ホーム
          </Link>{" "}
          /{" "}
          <Link href="/daily" className="transition hover:text-slate-600">
            日にち別まとめ
          </Link>{" "}
          / <span className="text-slate-600">{params.date}</span>
        </nav>

        {/* ── 前後ナビゲーション ── */}
        <div className="mb-4 flex items-center justify-between">
          {prevDateStr ? (
            <Link
              href={`/daily/${prevDateStr}`}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              ← 前の日
            </Link>
          ) : (
            <div />
          )}
          {nextDateStr ? (
            <Link
              href={`/daily/${nextDateStr}`}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              次の日 →
            </Link>
          ) : (
            <div />
          )}
        </div>

        {/* ── ヘッダ ── */}
        <div className="mb-6">
          <p className="mb-1 text-sm text-slate-400">
            {dateStr} の国会 — {meetings.length} 件の審議
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            {date.toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            の国会3分まとめ
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            国立国会図書館の会議録をもとに、この日の国会審議をAIでわかりやすく整理・要約しています。
          </p>
        </div>

        {/* ── 管理者まとめ ── */}
        {editorNote && editorNote.status === "published" && (
          <div className="mb-8 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                📝 管理者まとめ
              </span>
              <span className="text-xs text-slate-400">{dateStr}</span>
            </div>
            <p className="text-xs text-slate-500 mb-2">
              若年層の方々、政治勉強中の皆様向け
            </p>
            <h2 className="text-lg font-bold text-slate-800 mb-2">
              {editorNote.title || "本日の管理者の総まとめ"}
            </h2>
            {editorNote.introText && (
              <p className="text-sm font-medium text-slate-700 mb-3">
                {editorNote.introText}
              </p>
            )}
            <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
              {editorNote.editedText}
            </p>
            <p className="mt-4 text-[11px] text-slate-400">
              会議の流れをもとに、管理者が初心者向けに整理したメモです
            </p>
          </div>
        )}

        {/* ── 統計バー ── */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon="📋" label="審議件数" value={`${meetings.length}件`} />
          <StatCard icon="✅" label="要約済み" value={`${meetingsWithSummary.length}件`} />
          <StatCard icon="💬" label="総発言数" value={`${totalSpeeches.toLocaleString()}`} />
          <StatCard
            icon="🏛"
            label="衆/参"
            value={`${meetings.filter((m) => m.house === "衆議院").length}/${meetings.filter((m) => m.house === "参議院").length}`}
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* ── メインカラム ── */}
          <div className="space-y-6 lg:col-span-2">
            {/* 注目ポイント */}
            {topHighlights.length > 0 && (
              <Section title="この日の注目ポイント" icon="💡">
                <div className="space-y-2">
                  {topHighlights.map((h, i) => (
                    <div
                      key={i}
                      className={`flex gap-3 rounded-lg border p-3 text-sm ${
                        h.type === "conflict"
                          ? "border-red-100 bg-red-50/60"
                          : "border-amber-100 bg-amber-50/60"
                      }`}
                    >
                      <span className="mt-0.5 shrink-0">
                        {h.type === "conflict" ? "⚖️" : "🔍"}
                      </span>
                      <div>
                        <p className="leading-relaxed text-slate-700">{h.text}</p>
                        <p className="mt-1 text-xs text-slate-400">{h.meeting}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* テーマ */}
            {topTopics.length > 0 && (
              <Section title="この日のテーマ" icon="🏷">
                <div className="flex flex-wrap gap-2">
                  {topTopics.map((topic) => (
                    <TopicTag key={topic} tag={topic} />
                  ))}
                </div>
              </Section>
            )}

            {/* 合意・採決事項 */}
            {topAgreements.length > 0 && (
              <Section title="この日の主な合意・採決事項" icon="✅">
                <div className="card">
                  <ul className="space-y-2">
                    {topAgreements.map((a, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className="mt-0.5 shrink-0 font-medium text-green-500">▸</span>
                        <div>
                          <span className="text-slate-700">{a.text}</span>
                          <span className="ml-2 text-xs text-slate-400">[{a.meeting}]</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </Section>
            )}

            {/* 会議別まとめ */}
            <Section title={`会議別まとめ（${meetings.length}件）`} icon="📋">
              <div className="space-y-2">
                {meetings.map((m, i) => (
                  <AccordionDetails
                    key={m.id}
                    defaultOpen={i === 0}
                    title={m.nameOfMeeting}
                    badge={m.house}
                    subtitle={
                      m.summary?.keyTopics && m.summary.keyTopics.length > 0
                        ? m.summary.keyTopics.slice(0, 3).map(t => `#${t}`).join("  ")
                        : undefined
                    }
                  >
                    {m.summary?.bullets && m.summary.bullets.length > 0 ? (
                      <ul className="space-y-1.5 mb-3">
                        {m.summary.bullets.slice(0, 3).map((b, j) => (
                          <li key={j} className="text-sm text-slate-600 flex gap-2">
                            <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                            <span className="line-clamp-2">{b}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-400 mb-3">要約を生成中です…</p>
                    )}
                    <Link
                      href={`/meetings/${m.id}`}
                      className="inline-flex items-center text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      詳しく見る →
                    </Link>
                  </AccordionDetails>
                ))}
              </div>
            </Section>
          </div>

          {/* ── サイドバー ── */}
          <aside className="space-y-4">
            <div className="card">
              <p className="mb-2 font-semibold text-slate-700">⚠️ ご注意</p>
              <p className="text-xs leading-relaxed text-slate-500">
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

            <PartyBalanceChart balanceData={partyBalance} />

            <div className="card">
              <p className="mb-3 font-semibold text-slate-700">🏛 院別の内訳</p>
              <div className="space-y-2">
                {["衆議院", "参議院"].map((house) => {
                  const count = meetings.filter((m) => m.house === house).length;
                  const pct =
                    meetings.length > 0 ? Math.round((count / meetings.length) * 100) : 0;
                  return (
                    <div key={house}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-slate-600">{house}</span>
                        <span className="text-slate-500">{count} 件</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
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

            {/* 日にち別まとめ一覧へ */}
            <Link href="/daily" className="block card text-center hover:border-blue-300">
              <p className="text-sm font-medium text-blue-600">
                📅 他の日のまとめを見る →
              </p>
            </Link>

            {/* 会議一覧へ */}
            <Link href="/meetings" className="block card text-center hover:border-blue-300">
              <p className="text-sm font-medium text-blue-600">
                📚 会議一覧を見る →
              </p>
            </Link>
          </aside>
        </div>

        {/* ── 下部ナビゲーション ── */}
        <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
          {prevDateStr ? (
            <Link
              href={`/daily/${prevDateStr}`}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              ← 前の日のまとめ
            </Link>
          ) : (
            <div />
          )}
          <Link
            href="/daily"
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            一覧に戻る
          </Link>
          {nextDateStr ? (
            <Link
              href={`/daily/${nextDateStr}`}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              次の日のまとめ →
            </Link>
          ) : (
            <div />
          )}
        </div>
      </div>
    </>
  );
}
