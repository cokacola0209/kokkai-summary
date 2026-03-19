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
  HighlightBox,
} from "@/components/ui";

export const revalidate = 3600;

interface Props {
  params: { id: string };
  searchParams?: {
    admin?: string | string[];
  };
}

function getSingleParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

type BeginnerGuideContent = {
  label: string;
  summary: string;
  points: string[];
  conflictHint: string;
  lifeImpact: string;
};

type SocialSummaryContent = {
  twoLineText: string;
  threeLineText: string;
  tags: string[];
  note: string;
};

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

// 関連会議 / このテーマの他の会議
async function getRelatedMeetingGroups(
  meetingId: string,
  date: Date,
  nameOfMeeting: string,
  keyTopics: string[]
) {
  const committeeLabel = getCommitteeLabel(nameOfMeeting);
  const primaryTopic = keyTopics[0] ?? null;

  const sameDayMeetings = await prisma.meeting.findMany({
    where: {
      date,
      id: { not: meetingId },
    },
    include: {
      summary: {
        select: {
          bullets: true,
          keyTopics: true,
        },
      },
    },
    take: 4,
    orderBy: { nameOfMeeting: "asc" },
  });

  let sameCommitteeMeetings: typeof sameDayMeetings = [];
  if (committeeLabel) {
    sameCommitteeMeetings = await prisma.meeting.findMany({
      where: {
        id: { not: meetingId },
        nameOfMeeting: {
          contains: committeeLabel,
        },
      },
      include: {
        summary: {
          select: {
            bullets: true,
            keyTopics: true,
          },
        },
      },
      take: 8,
      orderBy: { date: "desc" },
    });
  }

  let sameTopicMeetings: typeof sameDayMeetings = [];
  if (primaryTopic) {
    sameTopicMeetings = await prisma.meeting.findMany({
      where: {
        id: { not: meetingId },
        summary: {
          is: {
            keyTopics: {
              has: primaryTopic,
            },
          },
        },
      },
      include: {
        summary: {
          select: {
            bullets: true,
            keyTopics: true,
          },
        },
      },
      take: 10,
      orderBy: { date: "desc" },
    });
  }

  const usedIds = new Set<string>(sameDayMeetings.map((m) => m.id));

  const dedupedCommitteeMeetings = sameCommitteeMeetings
    .filter((m) => !usedIds.has(m.id))
    .slice(0, 4);

  for (const m of dedupedCommitteeMeetings) {
    usedIds.add(m.id);
  }

  const dedupedTopicMeetings = sameTopicMeetings
    .filter((m) => !usedIds.has(m.id))
    .slice(0, 6);

  return {
    committeeLabel,
    primaryTopic,
    sameDayMeetings,
    sameCommitteeMeetings: dedupedCommitteeMeetings,
    sameTopicMeetings: dedupedTopicMeetings,
  };
}

// ──────────────────────────────────────────
// 初見向けテーマガイド
// ──────────────────────────────────────────
function getBeginnerThemeGuide(keyTopics: string[]): BeginnerGuideContent | null {
  const joined = keyTopics.join(" / ");

  const guides: Array<{
    label: string;
    keywords: string[];
    content: BeginnerGuideContent;
  }> = [
    {
      label: "外交",
      keywords: ["外交", "安全保障", "防衛", "日米", "中国", "台湾", "ウクライナ"],
      content: {
        label: "外交",
        summary:
          "外国との関係や安全保障、国際協力について扱うテーマです。国内向けの制度の話に見えても、背景に国際情勢があることが多いです。",
        points: [
          "政府が何を目標にしているのか",
          "相手国や国際情勢をどう見ているのか",
          "費用・役割分担・法的根拠が示されているか",
        ],
        conflictHint:
          "安全保障をどこまで重視するか、負担やリスクをどこまで受け入れるかで意見が分かれやすいです。",
        lifeImpact:
          "防衛費、エネルギー価格、輸入物価、サプライチェーンなどを通じて暮らしにも影響します。",
      },
    },
    {
      label: "物価",
      keywords: ["物価", "賃金", "税", "消費税", "家計", "円安", "ガソリン"],
      content: {
        label: "物価",
        summary:
          "生活費や賃金、税負担など、家計に直結しやすいテーマです。数字だけでなく、誰にどの程度効くのかを見るのが大切です。",
        points: [
          "物価上昇に対して、賃上げや減税が追いつくのか",
          "対象が広い支援か、限定的な支援か",
          "一時的対策か、長期的な仕組みか",
        ],
        conflictHint:
          "減税・給付・補助金のどれが有効か、財源をどうするかで対立しやすいです。",
        lifeImpact:
          "食品、光熱費、ガソリン、社会保険料など、日々の支出にそのまま関わりやすいテーマです。",
      },
    },
    {
      label: "医療",
      keywords: ["医療", "介護", "保険", "病院", "診療", "薬価", "感染症", "高額療養費"],
      content: {
        label: "医療",
        summary:
          "病院、保険制度、介護、薬価などを通じて、医療をどう維持するかを考えるテーマです。",
        points: [
          "患者の負担と公費負担のバランス",
          "地域で必要な医療が維持できるか",
          "現場の人手不足や制度運用の負担がどう扱われているか",
        ],
        conflictHint:
          "負担増をどこまで認めるか、制度維持を優先するか、利用者保護を優先するかで意見が割れやすいです。",
        lifeImpact:
          "受診時の負担、介護サービス、薬価、保険料などに影響しやすいテーマです。",
      },
    },
    {
      label: "教育",
      keywords: ["教育", "学校", "大学", "子ども", "少子化", "保育", "学習"],
      content: {
        label: "教育",
        summary:
          "学校教育だけでなく、子育て、保育、大学、学び直しまで含めて、将来の土台をどう支えるかに関わるテーマです。",
        points: [
          "対象が子ども本人なのか、家庭支援なのか",
          "地域差や所得差が縮まる設計か",
          "学校現場や保育現場の負担に配慮があるか",
        ],
        conflictHint:
          "公平性を重視するか、重点配分を重視するか、国と自治体の役割をどう分けるかで論点が分かれます。",
        lifeImpact:
          "学費、給食、保育、奨学金、学習環境など、若年層や子育て世帯に影響しやすいです。",
      },
    },
    {
      label: "少子化・子育て",
      keywords: ["少子化", "子育て", "育児", "出産", "こども", "保育", "児童手当"],
      content: {
        label: "少子化・子育て",
        summary:
          "子どもを育てやすい環境をどう作るか、出産・育児・保育・働き方をどう支えるかに関わるテーマです。",
        points: [
          "支援の対象が広いのか、特定の世帯向けなのか",
          "一時的な給付か、長く効く仕組みか",
          "家庭だけでなく、保育や働き方の負担まで見ているか",
        ],
        conflictHint:
          "現金給付を重視するか、保育・教育・働き方の整備を重視するかで意見が分かれやすいです。",
        lifeImpact:
          "保育料、児童手当、育休、働きやすさなどを通じて、子育て世帯や若い世代に影響しやすいです。",
      },
    },
    {
      label: "年金・社会保障",
      keywords: ["年金", "社会保障", "保険料", "負担", "給付", "高齢者", "現役世代"],
      content: {
        label: "年金・社会保障",
        summary:
          "年金や社会保険をどう維持するか、世代ごとの負担と給付をどう分けるかに関わるテーマです。",
        points: [
          "誰の負担が増えるのか、誰の給付が変わるのか",
          "短期的な対策か、制度全体の見直しか",
          "現役世代と高齢世代のバランスがどう説明されているか",
        ],
        conflictHint:
          "負担増を受け入れて制度維持を優先するか、給付や負担の見直しを強く進めるかで争点になりやすいです。",
        lifeImpact:
          "給与から引かれる保険料、老後の受け取り額、医療や介護の自己負担などに関わります。",
      },
    },
    {
      label: "エネルギー・電力",
      keywords: ["エネルギー", "電力", "再エネ", "原発", "電気料金", "ガス", "脱炭素"],
      content: {
        label: "エネルギー・電力",
        summary:
          "電気やガスを安定して使えるようにすることと、料金・安全性・環境負荷をどう両立するかを扱うテーマです。",
        points: [
          "安定供給と料金抑制のどちらを重く見ているか",
          "再エネ・原発・火力の役割分担がどう示されているか",
          "短期の値上がり対策か、長期の供給体制づくりか",
        ],
        conflictHint:
          "安全性、コスト、脱炭素のどれを優先するかで意見が分かれやすいです。",
        lifeImpact:
          "電気代、ガス代、ガソリン代、企業のコストを通じて、家計や物価にも影響しやすいです。",
      },
    },
    {
      label: "農業・食料",
      keywords: ["農業", "食料", "コメ", "米", "酪農", "農家", "食料安全保障", "輸入"],
      content: {
        label: "農業・食料",
        summary:
          "食べ物を安定して確保することと、農家の経営や国内生産をどう守るかに関わるテーマです。",
        points: [
          "消費者の価格と生産者の負担をどう両立するか",
          "国内生産を守るのか、輸入も活用するのか",
          "補助金や支援が短期対策か、持続的な仕組みか",
        ],
        conflictHint:
          "価格の安さを優先するか、国内農業の維持や食料安全保障を優先するかで対立しやすいです。",
        lifeImpact:
          "コメや野菜、乳製品などの値段、供給の安定、地域の産業維持に影響しやすいです。",
      },
    },
    {
      label: "防災",
      keywords: ["防災", "災害", "地震", "避難", "豪雨", "復旧", "インフラ"],
      content: {
        label: "防災",
        summary:
          "災害への備え、避難、復旧、インフラ強化などを扱うテーマです。災害後の支援だけでなく、平時の備えも重要です。",
        points: [
          "被害を減らすための事前投資があるか",
          "避難・復旧支援が現場に届く設計か",
          "国・自治体・民間の役割分担が整理されているか",
        ],
        conflictHint:
          "予算配分をどこまで事前対策に回すか、地域ごとの優先順位をどうつけるかで争点になりやすいです。",
        lifeImpact:
          "避難所、住宅再建、交通、水道、通信など、生活インフラに直結するテーマです。",
      },
    },
    {
      label: "政治改革",
      keywords: ["政治改革", "政治資金", "献金", "選挙", "裏金", "改革"],
      content: {
        label: "政治改革",
        summary:
          "政治のルールや透明性、政治資金の扱い、選挙制度など、政治の信頼に関わるテーマです。",
        points: [
          "ルール違反への罰則や監視が十分か",
          "透明性がどこまで高まるのか",
          "抜け道が残らない設計か",
        ],
        conflictHint:
          "規制強化の範囲や、政治活動の自由とのバランスをどう取るかで意見が割れやすいです。",
        lifeImpact:
          "すぐ生活費に出るテーマではありませんが、税金の使われ方や政治への信頼に関わります。",
      },
    },
  ];

  const matched = guides.find((guide) =>
    guide.keywords.some((keyword) => joined.includes(keyword))
  );

  return matched?.content ?? null;
}

// ──────────────────────────────────────────
// SNS向け短文要点
// ──────────────────────────────────────────
function shortenText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function buildSocialSummary(args: {
  meetingName: string;
  keyTopics: string[];
  bullets: string[];
  agreementPoints: string[];
  conflictPoints: string[];
  impactNotes: string[];
}): SocialSummaryContent {
  const {
    meetingName,
    keyTopics,
    bullets,
    agreementPoints,
    conflictPoints,
    impactNotes,
  } = args;

  const headline =
    bullets[0] ?? `${meetingName}について、主な論点と対応が議論されました。`;

  const secondLabel = agreementPoints[0]
    ? "決まったこと"
    : impactNotes[0]
      ? "注目点"
      : "要点";

  const secondText =
    agreementPoints[0] ??
    impactNotes[0] ??
    bullets[1] ??
    "会議で重要な論点が整理されました。";

  const thirdLabel = conflictPoints[0]
    ? "争点"
    : impactNotes[0]
      ? "影響"
      : "補足";

  const thirdText =
    conflictPoints[0] ??
    impactNotes[0] ??
    bullets[2] ??
    "詳しくは本文と一次情報の確認が必要です。";

  const twoLineText = [
    `要点: ${shortenText(headline, 58)}`,
    `${thirdLabel}: ${shortenText(thirdText, 58)}`,
  ].join("\n");

  const threeLineText = [
    `会議: ${shortenText(meetingName, 42)}`,
    `${secondLabel}: ${shortenText(secondText, 52)}`,
    `${thirdLabel}: ${shortenText(thirdText, 52)}`,
  ].join("\n");

  const tags = Array.from(new Set([keyTopics[0], keyTopics[1]])).filter(
    Boolean
  ) as string[];

  return {
    twoLineText,
    threeLineText,
    tags,
    note:
      "本文の要約を短く抜き出したものです。投稿や引用の前に、一次情報もあわせて確認するのがおすすめです。",
  };
}

// ──────────────────────────────────────────
// SEO
// ──────────────────────────────────────────
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const meeting = await getMeeting(params.id);
  if (!meeting) return { title: "会議が見つかりません" };

  const dateStr = meeting.date.toLocaleDateString("ja-JP");
  const desc =
    meeting.summary?.bullets[0] ?? `${meeting.nameOfMeeting}の会議録要約`;

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

/** フル表示カード（上位4名用） */
function SpeakerCard({ s }: { s: SpeakerSummary }) {
  return (
    <div className="card">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm">
          👤
        </div>
        <div>
          <Link href={`/meetings?person=${encodeURIComponent(s.speaker)}`} className="text-sm font-semibold text-slate-800 hover:text-blue-600 transition-colors">{s.speaker}</Link>
          {s.group && <p className="text-xs text-slate-400">{s.group}</p>}
        </div>
      </div>
      <p className="mb-2 text-sm leading-relaxed text-slate-700">{s.summary}</p>
      {s.quotes.length > 0 && (
        <div className="space-y-1.5">
          {s.quotes.map((q, i) => (
            <blockquote
              key={i}
              className="border-l-4 border-slate-200 pl-3 text-xs italic leading-relaxed text-slate-500"
            >
              「{q}」
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}

/** 折りたたみカード（5名目以降用） */
function CollapsedSpeakerCard({ s }: { s: SpeakerSummary }) {
  const summaryPreview = shortenText(s.summary, 50);

  return (
    <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm">
          👤
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
          <Link href={`/meetings?person=${encodeURIComponent(s.speaker)}`} className="text-sm font-semibold text-slate-800 hover:text-blue-600 transition-colors">{s.speaker}</Link>
            {s.group && (
              <span className="text-xs text-slate-400">{s.group}</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {summaryPreview}
          </p>
        </div>
        <svg
          className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>

      <div className="border-t border-slate-100 px-4 pb-4 pt-3">
        <p className="mb-2 text-sm leading-relaxed text-slate-700">
          {s.summary}
        </p>
        {s.quotes.length > 0 && (
          <div className="space-y-1.5">
            {s.quotes.map((q, i) => (
              <blockquote
                key={i}
                className="border-l-4 border-slate-200 pl-3 text-xs italic leading-relaxed text-slate-500"
              >
                「{q}」
              </blockquote>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

// ──────────────────────────────────────────
// 関連会議カード（小型）
// ──────────────────────────────────────────
function RelatedMeetingLink({
  meeting,
}: {
  meeting: {
    id: string;
    date: Date;
    house: string;
    nameOfMeeting: string;
    summary: { bullets: string[]; keyTopics: string[] } | null;
  };
}) {
  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="block rounded-lg border border-slate-100 bg-white p-3 transition-all hover:border-blue-200 hover:shadow-sm"
    >
      <div className="mb-1 flex items-center gap-2">
        <HouseBadge house={meeting.house} />
        <span className="text-xs text-slate-400">
          {meeting.date.toLocaleDateString("ja-JP")}
        </span>
      </div>
      <p className="line-clamp-1 text-sm font-medium text-slate-700">
        {meeting.nameOfMeeting}
      </p>
      {meeting.summary?.bullets[0] && (
        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
          {meeting.summary.bullets[0]}
        </p>
      )}
      {meeting.summary?.keyTopics?.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {meeting.summary.keyTopics.slice(0, 2).map((topic) => (
            <span
              key={topic}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500"
            >
              #{topic}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

function BeginnerThemeGuideBox({
  guide,
  primaryTopic,
}: {
  guide: BeginnerGuideContent;
  primaryTopic: string | null;
}) {
  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
          初見向けガイド
        </span>
        <span className="text-sm font-semibold text-slate-700">
          {guide.label}とは？
        </span>
        {primaryTopic && <TopicTag tag={primaryTopic} />}
      </div>

      <p className="text-sm leading-relaxed text-slate-700">
        {guide.summary}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">
            まず見るポイント
          </p>
          <ul className="mt-2 space-y-1.5">
            {guide.points.map((point, i) => (
              <li key={i} className="text-sm leading-relaxed text-slate-700">
                ・{point}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg bg-red-50/60 p-3">
          <p className="text-xs font-semibold text-red-600">
            争点になりやすい点
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            {guide.conflictHint}
          </p>
        </div>

        <div className="rounded-lg bg-amber-50/60 p-3">
          <p className="text-xs font-semibold text-amber-600">
            生活とのつながり
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            {guide.lifeImpact}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        {primaryTopic && (
          <Link
            href={`/meetings?topic=${encodeURIComponent(primaryTopic)}`}
            className="text-blue-600 hover:text-blue-700"
          >
            このテーマの会議を一覧で見る →
          </Link>
        )}
        <Link
          href="/meetings"
          className="text-slate-500 hover:text-slate-700"
        >
          他の会議から見比べる →
        </Link>
      </div>
    </div>
  );
}

function SocialSummaryBox({
  socialSummary,
  primaryTopic,
  sourceUrl,
}: {
  socialSummary: SocialSummaryContent;
  primaryTopic: string | null;
  sourceUrl: string;
}) {
  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
          SNS向け
        </span>
        <span className="text-sm font-semibold text-slate-700">
          2〜3行版の要点
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">2行版</p>
          <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 font-sans">
            {socialSummary.twoLineText}
          </pre>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">3行版</p>
          <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 font-sans">
            {socialSummary.threeLineText}
          </pre>
        </div>
      </div>

      {(socialSummary.tags.length > 0 || primaryTopic) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {socialSummary.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500"
            >
              #{tag}
            </span>
          ))}
          {primaryTopic && !socialSummary.tags.includes(primaryTopic) && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
              #{primaryTopic}
            </span>
          )}
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        {socialSummary.note}
      </p>

      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:text-blue-700"
        >
          一次情報を見る →
        </a>
        {primaryTopic && (
          <Link
            href={`/meetings?topic=${encodeURIComponent(primaryTopic)}`}
            className="text-slate-500 hover:text-slate-700"
          >
            このテーマの他の会議を見る →
          </Link>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// Page
// ──────────────────────────────────────────
export default async function MeetingDetailPage({
  params,
  searchParams,
}: Props) {
  const meeting = await getMeeting(params.id);
  if (!meeting) notFound();

  const isAdminView = getSingleParam(searchParams?.admin) === "1";

  const summary = meeting.summary;
  const speakerSummaries =
    (summary?.speakerSummaries as SpeakerSummary[] | null) ?? [];

  // ── 上位4名（2列×2行）はフル表示、残りは折りたたみ ──
  const FULL_DISPLAY_COUNT = 2;
  const fullSpeakers = speakerSummaries.slice(0, FULL_DISPLAY_COUNT);
  const collapsedSpeakers = speakerSummaries.slice(FULL_DISPLAY_COUNT);

  const dateStr = meeting.date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const {
    committeeLabel,
    primaryTopic,
    sameDayMeetings,
    sameCommitteeMeetings,
    sameTopicMeetings,
  } = await getRelatedMeetingGroups(
    meeting.id,
    meeting.date,
    meeting.nameOfMeeting,
    summary?.keyTopics ?? []
  );

  const beginnerGuide = getBeginnerThemeGuide(summary?.keyTopics ?? []);
  const socialSummary = summary
    ? buildSocialSummary({
        meetingName: meeting.nameOfMeeting,
        keyTopics: summary.keyTopics,
        bullets: summary.bullets,
        agreementPoints: summary.agreementPoints,
        conflictPoints: summary.conflictPoints,
        impactNotes: summary.impactNotes,
      })
    : null;

  return (
    <>
      <MeetingJsonLd meeting={meeting} />

      <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
        {/* パンくず */}
        <nav className="mb-4 text-sm text-slate-400 fade-in">
          <Link href="/" className="transition hover:text-slate-600">
            ホーム
          </Link>{" "}
          /{" "}
          <Link href="/meetings" className="transition hover:text-slate-600">
            会議一覧
          </Link>{" "}
          / <span className="text-slate-600">{meeting.nameOfMeeting}</span>
        </nav>

        {/* ── ヘッダ ── */}
        <div className="mb-6 fade-in">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <HouseBadge house={meeting.house} />
            <p className="text-sm text-slate-400">{dateStr}</p>
            {meeting.issue && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                {meeting.issue}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold leading-tight text-slate-900">
            {meeting.nameOfMeeting}
          </h1>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              💬 発言 {meeting.speeches.length} 件
            </span>
            <a
              href={meeting.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-blue-600 transition hover:text-blue-800"
            >
              📄 一次情報を見る
            </a>
          </div>
        </div>

        {/* ── 「この会議の見どころ」ハイライト ── */}
        {summary && (
          <HighlightBox
            bullets={summary.bullets}
            conflictPoints={summary.conflictPoints}
            impactNotes={summary.impactNotes}
            agreementPoints={summary.agreementPoints}
          />
        )}
    {/* ── この会議の主要発言者 ── */}
    {speakerSummaries.length > 0 && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <p className="mb-3 text-sm font-bold text-slate-700">👥 この会議の主要発言者</p>
            <div className="flex flex-wrap gap-2">
              {speakerSummaries.slice(0, 8).map((s, i) => (
                <Link
                  key={i}
                  href={`/meetings?person=${encodeURIComponent(s.speaker)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  <span className="font-medium">{s.speaker}</span>
                  {s.group && <span className="text-slate-400">{s.group}</span>}
                </Link>
              ))}
              {speakerSummaries.length > 8 && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500">
                  +{speakerSummaries.length - 8}名
                </span>
              )}
            </div>
          </div>
        )}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* ── メインカラム ── */}
          <div className="space-y-6 lg:col-span-2">
            {!summary ? (
              <div className="card py-12 text-center">
                <p className="text-slate-400">要約を生成中です…</p>
              </div>
            ) : (
              <>
                {/* キートピック */}
                {summary.keyTopics.length > 0 && (
                  <Section title="主なテーマ" icon="🏷">
                    <div className="flex flex-wrap gap-2">
                      {summary.keyTopics.map((t) => (
                        <TopicTag key={t} tag={t} />
                      ))}
                    </div>
                  </Section>
                )}

               {/* 初見向けガイド */}
  {beginnerGuide && (
    <Section title="このテーマを初めて見る人へ" icon="🧭">
      <BeginnerThemeGuideBox
        guide={beginnerGuide}
        primaryTopic={primaryTopic}
      />
    </Section>
  )}

  {/* 会議の流れ */}
  <Section title="会議の流れ" icon="📋">
    <div className="card">
      <BulletList items={summary.bullets} color="blue" />
    </div>
  </Section>

  {/* 決まったこと */}
  <Section title="決まったこと" icon="✅">
    <div className="card">
      <BulletList items={summary.agreementPoints} color="green" />
    </div>
  </Section>

  {/* 意見が分かれた点 */}
  <Section title="意見が分かれた点" icon="⚖️">
    <div className="card">
      <BulletList items={summary.conflictPoints} color="red" />
    </div>
  </Section>

  {/* 暮らしへの影響・注目点 */}
  <Section title="暮らしへの影響・注目点" icon="🔍">
    <div className="card">
      <BulletList items={summary.impactNotes} color="amber" />
    </div>
  </Section>

  {/* 一次情報リンク */}
  <SourceLinks links={summary.sourceLinks} />

  {/* モデル情報 */}
  <p className="mt-4 text-xs text-slate-300">
    要約モデル: {summary.modelUsed} / 更新:{" "}
    {summary.updatedAt.toLocaleDateString("ja-JP")}
  </p>
</>
            )}

            {/* ── 発言者ごとの要点 ── */}
            {speakerSummaries.length > 0 && (
              <Section
                title={`発言者ごとの要点（${speakerSummaries.length}名）`}
                icon="👥"
              >
                {/* 上位4名: フル表示 */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {fullSpeakers.map((s, i) => (
                    <SpeakerCard key={i} s={s} />
                  ))}
                </div>

                {/* 5名目以降: 折りたたみ表示 */}
                {collapsedSpeakers.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-3 text-xs font-medium text-slate-400">
                      その他の発言者（{collapsedSpeakers.length}名） — タップで詳細を表示
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {collapsedSpeakers.map((s, i) => (
                        <CollapsedSpeakerCard key={i} s={s} />
                      ))}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* ── 関連会議 ── */}
            {(sameDayMeetings.length > 0 || sameCommitteeMeetings.length > 0) && (
              <Section title="関連会議" icon="🔗">
                <div className="space-y-5">
                  {sameDayMeetings.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-700">
                          同じ日の会議
                        </p>
                        <Link
                          href="/meetings"
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          一覧を見る →
                        </Link>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {sameDayMeetings.map((m) => (
                          <RelatedMeetingLink key={m.id} meeting={m} />
                        ))}
                      </div>
                    </div>
                  )}

                  {sameCommitteeMeetings.length > 0 && committeeLabel && (
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-700">
                          同じ{committeeLabel}の最近の会議
                        </p>
                        <Link
                          href={`/meetings?committee=${encodeURIComponent(committeeLabel)}`}
                          className="text-xs text-blue-600 hover:text-blue-700"
                        >
                          この委員会で一覧を見る →
                        </Link>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {sameCommitteeMeetings.map((m) => (
                          <RelatedMeetingLink key={m.id} meeting={m} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* ── このテーマの他の会議 ── */}
            {sameTopicMeetings.length > 0 && primaryTopic && (
              <Section title="このテーマの他の会議" icon="🏷">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-500">テーマ:</span>
                  <TopicTag tag={primaryTopic} />
                  <Link
                    href={`/meetings?topic=${encodeURIComponent(primaryTopic)}`}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    このテーマで一覧を見る →
                  </Link>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {sameTopicMeetings.map((m) => (
                    <RelatedMeetingLink key={m.id} meeting={m} />
                  ))}
                </div>
              </Section>
            )}

            {/* ── 管理用: SNS向け要点 ── */}
{isAdminView && socialSummary && (
  <Section title="管理用：SNS向け2〜3行版要点" icon="🛠">
    <SocialSummaryBox
      socialSummary={socialSummary}
      primaryTopic={primaryTopic}
      sourceUrl={meeting.url}
    />
  </Section>
)}
          </div>

          {/* ── サイドバー ── */}
          <aside>
            <div className="card sticky top-20">
              <p className="mb-3 font-semibold text-slate-700">
                📜 発言一覧 ({meeting.speeches.length})
              </p>
              <div className="max-h-[500px] space-y-3 overflow-y-auto pr-1">
                {meeting.speeches.map((sp) => (
                  <div
                    key={sp.id}
                    className="border-b border-slate-100 pb-2 last:border-0"
                  >
                    <p className="text-xs font-medium text-slate-700">
                      {sp.speaker}
                      {sp.speakerGroup && (
                        <span className="ml-1 text-slate-400">
                          ({sp.speakerGroup})
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-slate-500">
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
