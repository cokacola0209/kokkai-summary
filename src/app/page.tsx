import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  SummaryCard,
  NoData,
  Section,
  TopicTag,
  BeginnerGuide,
  StatCard,
} from "@/components/ui";

export const revalidate = 0;

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  外交: ["外交", "安全保障", "防衛", "日米", "中国", "台湾", "ウクライナ"],
  物価: ["物価", "賃金", "税", "消費税", "家計", "円安", "ガソリン"],
  医療: ["医療", "介護", "保険", "病院", "診療", "薬価", "感染症"],
  教育: ["教育", "学校", "大学", "子ども", "少子化", "保育", "学習"],
  防災: ["防災", "災害", "地震", "避難", "豪雨", "復旧", "インフラ"],
  政治改革: ["政治改革", "政治資金", "献金", "選挙", "裏金", "改革"],
};

const PERSON_PATTERN =
  /([一-龯ぁ-んァ-ヶー々]{2,6}?)(?:副大臣|国務大臣|環境大臣|農林水産大臣|文部科学大臣|厚生労働大臣|経済産業大臣|国土交通大臣|防衛大臣|総務大臣|法務大臣|財務大臣|外務大臣|首相|総理大臣|総理|大臣|議員|委員長|参考人|長官|知事|市長|大統領|幹事長)/g;

function isValidPersonKeyword(fullMatch: string): boolean {
  const titleSuffixes = [
    "副大臣", "国務大臣", "環境大臣", "農林水産大臣", "文部科学大臣",
    "厚生労働大臣", "経済産業大臣", "国土交通大臣", "防衛大臣", "総務大臣",
    "法務大臣", "財務大臣", "外務大臣", "首相", "総理大臣", "総理",
    "大臣", "議員", "委員長", "参考人", "長官", "知事", "市長", "大統領", "幹事長",
  ];

  let nameOnly = fullMatch;
  for (const suffix of titleSuffixes) {
    if (nameOnly.endsWith(suffix)) {
      nameOnly = nameOnly.slice(0, -suffix.length);
      break;
    }
  }

  if (nameOnly.length < 2) return false;
  if (nameOnly.startsWith("対")) return false;

  const nonNameWords = [
    "環境", "国土", "交通", "農林", "水産", "文部", "科学",
    "厚生", "労働", "経済", "産業", "国務", "内閣", "防衛",
    "総務", "法務", "財務", "外務", "デジタル",
    "自民党", "立憲", "公明党", "公明", "維新", "共産党", "共産",
    "れいわ", "国民民主",
    "政務官", "事務局", "参考人",
  ];
  if (nonNameWords.some((word) => nameOnly.includes(word))) return false;

  return true;
}

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

// ── 勢力図データ取得 ──
async function getPartyBalance() {
  const seats = await prisma.partySeat.findMany({
    orderBy: [{ house: "asc" }, { seats: "desc" }],
    include: {
      party: {
        select: {
          shortName: true,
          color: true,
        },
      },
    },
  });

  // 院ごとにグループ化し、最新 asOf のデータだけ使う
  const byHouse = new Map<string, typeof seats>();
  for (const s of seats) {
    if (!byHouse.has(s.house)) {
      byHouse.set(s.house, []);
    }
    byHouse.get(s.house)!.push(s);
  }

  const result: Array<{
    house: string;
    totalSeats: number;
    majority: number;
    parties: Array<{
      shortName: string;
      color: string;
      seats: number;
      pct: number;
    }>;
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

const PRIORITY_PEOPLE = [
  "小野田紀美",
  "高市早苗",
  "小泉進次郎",
  "石破茂",
  "岩屋毅",
];

function extractPeopleKeywords(
  meetings: Awaited<ReturnType<typeof getLatestMeetings>>["meetings"]
): string[] {
  const counts = new Map<string, number>();

  for (const m of meetings) {
    const texts = [
      m.nameOfMeeting,
      ...(m.summary?.bullets ?? []),
      ...(m.summary?.agreementPoints ?? []),
      ...(m.summary?.conflictPoints ?? []),
      ...(m.summary?.impactNotes ?? []),
    ];

    for (const text of texts) {
      const matches = text.match(PERSON_PATTERN) ?? [];
      matches.forEach((name) => {
        if (isValidPersonKeyword(name)) {
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      });
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => {
      const aPriority = PRIORITY_PEOPLE.indexOf(a[0]);
      const bPriority = PRIORITY_PEOPLE.indexOf(b[0]);
      const aIsPriority = aPriority !== -1;
      const bIsPriority = bPriority !== -1;
      if (aIsPriority && bIsPriority) return aPriority - bPriority;
      if (aIsPriority) return -1;
      if (bIsPriority) return 1;
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], "ja");
    })
    .slice(0, 24)
    .map(([name]) => name);
}

async function getRecentTopics(): Promise<string[]> {
  const meetings = await prisma.meeting.findMany({
    orderBy: { date: "desc" },
    take: 100,
    include: {
      summary: {
        select: { keyTopics: true },
      },
    },
  });

  const counts = new Map<string, number>();
  for (const m of meetings) {
    for (const t of m.summary?.keyTopics ?? []) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
}

function buildCategoryLinks(todayTopics: string[], allTopics: string[]) {
  return Object.entries(CATEGORY_KEYWORDS).map(([label, keywords]) => {
    const todayMatch =
      todayTopics.find((topic) =>
        keywords.some(
          (keyword) => topic.includes(keyword) || keyword.includes(topic)
        )
      ) ?? null;

    if (todayMatch) {
      return {
        label,
        matchedTopic: todayMatch,
        href: `/topics/${encodeURIComponent(todayMatch)}`,
      };
    }

    const broadMatch =
      allTopics.find((topic) =>
        keywords.some(
          (keyword) => topic.includes(keyword) || keyword.includes(topic)
        )
      ) ?? null;

    return {
      label,
      matchedTopic: broadMatch,
      href: broadMatch
        ? `/topics/${encodeURIComponent(broadMatch)}`
        : "/meetings",
    };
  });
}

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

// ── 勢力図コンポーネント ──
function PartyBalanceChart({
  balanceData,
}: {
  balanceData: Awaited<ReturnType<typeof getPartyBalance>>;
}) {
  if (balanceData.length === 0) return null;

  return (
    <div className="card">
      <p className="mb-1 font-semibold text-slate-700">🏛 国会の勢力図</p>
      <p className="mb-4 text-xs text-slate-400">
        各会派の議席数（過半数ラインつき）
      </p>

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
              <span className="text-xs text-slate-400">
                過半数 {house.majority}
              </span>
            </div>

            {/* 議席バー */}
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

              {/* 過半数ライン */}
              <div
                className="absolute top-0 h-5 border-r-2 border-dashed border-slate-900/30"
                style={{
                  left: `${(house.majority / house.totalSeats) * 100}%`,
                }}
              />
            </div>

            {/* 凡例 */}
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {house.parties.map((p, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 text-[11px] text-slate-600"
                >
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

export default async function HomePage() {
  const { meetings, date } = await getLatestMeetings();

  if (!date || meetings.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
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
  const peopleKeywords = extractPeopleKeywords(meetings);

  const allTopics = await getRecentTopics();
  const categoryLinks = buildCategoryLinks(topTopics, allTopics);
  const spotlightMeetings = meetings.slice(0, 3);

  const topHighlightItems = highlights.slice(0, 3);
  const topAgreementItems = agreements.slice(0, 4);

  const meetingsWithSummary = meetings.filter((m) => m.summary);
  const totalSpeeches = meetings.reduce((s, m) => s + m._count.speeches, 0);

  const partyBalance = await getPartyBalance();

  return (
    <>
      <NewsArticleJsonLd date={date} meetingCount={meetings.length} />

      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* ── ヘッダ ── */}
        <div className="mb-6 fade-in">
          <p className="mb-1 text-sm text-slate-400">
            {dateStr} の国会 — {meetings.length} 件の審議
          </p>
          <h1 className="text-3xl font-bold text-slate-900">
            直近の国会 3分まとめ
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            国立国会図書館の会議録をもとに、国会議事録をAIでわかりやすく整理・要約しています。
          </p>
          <p className="mt-1 text-xs text-slate-400">
            最新反映日: {dateStr} ・ 新しい会議録はすぐに反映されない場合があります
          </p>
        </div>

        {/* ── 統計バー ── */}
        <div className="mb-8 grid grid-cols-2 gap-3 fade-in-up delay-1 sm:grid-cols-4">
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
            value={`${
              meetings.filter((m) => m.house === "衆議院").length
            }/${
              meetings.filter((m) => m.house === "参議院").length
            }`}
          />
        </div>

        {/* ── 初心者向けガイド ── */}
        <div className="mb-8 fade-in-up delay-2">
          <BeginnerGuide />
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* ── メインカラム ── */}
          <div className="space-y-6 lg:col-span-2">
            {/* 本日の注目ポイント */}
            {topHighlightItems.length > 0 && (
  <Section title="本日の注目ポイント" icon="💡">
    <div className="space-y-2">
      {topHighlightItems.map((h, i) => (
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

    {highlights.length > topHighlightItems.length && (
      <div className="mt-3 text-right">
        <Link
          href="/meetings"
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          会議一覧でもっと見る →
        </Link>
      </div>
    )}
  </Section>
)}

            {/* ── いま注目の入口 ── */}
<section className="mb-6 fade-in-up delay-3">
  <div className="mb-3 flex items-end justify-between gap-3">
    <div>
      <h2 className="text-xl font-bold text-slate-900">
        いま注目の入口
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        気になるテーマや分野から、入口を選べます。
      </p>
    </div>
    <Link
      href="/meetings"
      className="text-sm font-medium text-blue-600 hover:text-blue-700"
    >
      会議一覧を見る →
    </Link>
  </div>

  <div className="grid gap-4 lg:grid-cols-3">
    {/* テーマ・分野 */}
    <div className="card lg:col-span-2">
      <p className="text-sm font-semibold text-slate-800">
        🔥 注目テーマ・分野
      </p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        今日よく出てきたテーマや、関心分野から入れます。
      </p>

      <div className="mt-3">
        <p className="text-xs font-medium text-slate-400">テーマ</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {topTopics.length > 0 ? (
            topTopics.slice(0, 4).map((topic) => (
              <TopicTag key={topic} tag={topic} />
            ))
          ) : (
            <span className="text-xs text-slate-400">
              まだテーマがありません
            </span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-slate-400">分野</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {categoryLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>

    <div className="space-y-4">
      {/* 人物キーワード */}
<div className="card">
  <div className="flex items-center justify-between gap-3">
    <p className="text-sm font-semibold text-slate-800">
      👤 人物キーワード
    </p>
    <Link
      href="/people"
      className="text-xs text-slate-400 hover:text-slate-600"
    >
      一覧へ
    </Link>
  </div>

  <p className="mt-1 text-xs leading-relaxed text-slate-500">
    気になる人物名から、その人が出てくる会議を絞り込めます。
  </p>

  <div className="mt-3">
  {peopleKeywords.length > 0 ? (
    <>
      <div className="relative">
        <div className="max-h-[72px] overflow-hidden">
          <div className="flex flex-wrap gap-2">
            {peopleKeywords.map((name) => (
              <Link
                key={name}
                href={`/meetings?person=${encodeURIComponent(name)}`}
                className="inline-flex whitespace-nowrap items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                {name}
              </Link>
            ))}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          クリックすると会議一覧でその人物を含む会議に絞り込みます。
        </p>

        <Link
  href="/people"
  className="text-xs font-medium text-blue-600 hover:text-blue-700"
>
  人物一覧を見る →
</Link>
      </div>
    </>
  ) : (
    <span className="text-xs text-slate-400">
      人物キーワードはまだ少なめです
    </span>
  )}
</div>
</div>

      {/* 今日の会議 */}
      <div className="card">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-800">
            📌 今日の会議
          </p>
          <Link
            href="/meetings"
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            もっと見る →
          </Link>
        </div>

        <div className="mt-3 space-y-2">
          {spotlightMeetings.slice(0, 2).map((meeting) => (
            <Link
              key={meeting.id}
              href={`/meetings/${meeting.id}`}
              className="block rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 transition-colors hover:border-blue-200 hover:bg-blue-50"
            >
              <p className="text-xs text-slate-400">{meeting.house}</p>
              <p className="mt-1 text-sm leading-snug text-slate-700">
                {meeting.nameOfMeeting}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  </div>
</section>



            {/* 本日の合意・採決事項 */}
            {topAgreementItems.length > 0 && (
  <Section title="本日の主な合意・採決事項" icon="✅">
    <div className="card">
      <ul className="space-y-2">
        {topAgreementItems.map((a, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className="mt-0.5 shrink-0 font-medium text-green-500">
              ▸
            </span>
            <div>
              <span className="text-slate-700">{a.text}</span>
              <span className="ml-2 text-xs text-slate-400">
                [{a.meeting}]
              </span>
            </div>
          </li>
        ))}
      </ul>

      {agreements.length > topAgreementItems.length && (
        <div className="mt-3 text-right">
          <Link
            href="/meetings"
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            続きを会議一覧で見る →
          </Link>
        </div>
      )}
    </div>
  </Section>
)}

            {/* 会議別まとめ */}
            <Section title={`会議別まとめ（${meetings.length}件）`} icon="📋">
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

            {/* ── 勢力図 ── */}
            <PartyBalanceChart balanceData={partyBalance} />

            <div className="card">
              <p className="mb-3 font-semibold text-slate-700">🏛 院別の内訳</p>
              <div className="space-y-2">
                {["衆議院", "参議院"].map((house) => {
                  const count = meetings.filter((m) => m.house === house).length;
                  const pct =
                    meetings.length > 0
                      ? Math.round((count / meetings.length) * 100)
                      : 0;

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

            <Link
              href="/meetings"
              className="block card text-center hover:border-blue-300"
            >
              <p className="text-sm font-medium text-blue-600">
                📚 過去の会議一覧を見る →
              </p>
            </Link>
          </aside>
        </div>
      </div>
    </>
  );
}
