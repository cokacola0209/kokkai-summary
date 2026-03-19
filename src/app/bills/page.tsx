import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BillCard, BillStatusBadge, BILL_THEMES, getBillTheme, getSubmitterType } from "@/components/BillCard";
import { AccordionDetails } from "@/components/Accordion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "国会で決まった法案 – 国会ラボ",
  description:
    "国会に提出された法案の一覧です。成立・可決・審議中・提出済みのステータスで確認できます。",
};

// ──────────────────────────────────────────
// ステータスタブ定義
// ──────────────────────────────────────────

const STATUS_TABS = [
  { key: "all", label: "すべて", emoji: "📋" },
  { key: "enacted", label: "成立", emoji: "✅" },
  { key: "passed", label: "可決", emoji: "🟢" },
  { key: "deliberating", label: "審議中", emoji: "🟡" },
  { key: "submitted", label: "提出", emoji: "📝" },
] as const;

// テーマ一覧（フィルタ用）
const THEME_OPTIONS = Object.keys(BILL_THEMES);

// 提出元一覧
const SUBMITTER_OPTIONS = [
  { key: "閣法", label: "閣法（内閣提出）" },
  { key: "衆法", label: "衆法（衆議院議員）" },
  { key: "参法", label: "参法（参議院議員）" },
];

// ──────────────────────────────────────────
// データ取得
// ──────────────────────────────────────────

async function getBills(status?: string) {
  const where: Record<string, unknown> = {};
  if (status && status !== "all") {
    where.status = status;
  }

  return prisma.bill.findMany({
    where,
    orderBy: [
      { enactedAt: { sort: "desc", nulls: "last" } },
      { passedAt: { sort: "desc", nulls: "last" } },
      { submittedAt: { sort: "desc", nulls: "last" } },
    ],
    include: {
      _count: {
        select: { meetings: true },
      },
    },
  });
}

async function getBillStats() {
  const [total, enacted, passed, deliberating, submitted] = await Promise.all([
    prisma.bill.count(),
    prisma.bill.count({ where: { status: "enacted" } }),
    prisma.bill.count({ where: { status: "passed" } }),
    prisma.bill.count({ where: { status: "deliberating" } }),
    prisma.bill.count({ where: { status: "submitted" } }),
  ]);
  return { total, enacted, passed, deliberating, submitted };
}

// ──────────────────────────────────────────
// ページ
// ──────────────────────────────────────────

interface Props {
  searchParams?: {
    status?: string;
    theme?: string;
    submitter?: string;
  };
}

export default async function BillsPage({ searchParams }: Props) {
  const activeStatus = searchParams?.status ?? "all";
  const activeTheme = searchParams?.theme ?? "";
  const activeSubmitter = searchParams?.submitter ?? "";

  const [allBills, stats] = await Promise.all([
    getBills(activeStatus),
    getBillStats(),
  ]);

  // テーマフィルタ（サーバー側でキーワードマッチ）
  let bills = allBills;
  if (activeTheme) {
    const keywords = BILL_THEMES[activeTheme];
    if (keywords) {
      bills = bills.filter((bill) => {
        const text = `${bill.title} ${bill.summary}`;
        return keywords.some((kw) => text.includes(kw));
      });
    }
  }

  // 提出元フィルタ（billCodeからマッチ）
  if (activeSubmitter) {
    bills = bills.filter((bill) => getSubmitterType(bill.billCode) === activeSubmitter);
  }

  const countMap: Record<string, number> = {
    all: stats.total,
    enacted: stats.enacted,
    passed: stats.passed,
    deliberating: stats.deliberating,
    submitted: stats.submitted,
  };

  // フィルタURL構築ヘルパー
  function buildHref(overrides: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = {
      status: activeStatus,
      theme: activeTheme,
      submitter: activeSubmitter,
      ...overrides,
    };
    if (merged.status && merged.status !== "all") params.set("status", merged.status);
    if (merged.theme) params.set("theme", merged.theme);
    if (merged.submitter) params.set("submitter", merged.submitter);
    return `/bills${params.toString() ? `?${params}` : ""}`;
  }

  const isFiltered = activeStatus !== "all" || activeTheme || activeSubmitter;

  return (
    <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
      {/* パンくず */}
      <nav className="mb-4 text-sm text-slate-400">
        <Link href="/" className="transition hover:text-slate-600">
          ホーム
        </Link>{" "}
        / <span className="text-slate-600">法案一覧</span>
      </nav>

      {/* ── ヘッダ ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          📜 国会で決まった法案
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          国会に提出された法案を、ステータスごとに確認できます。
          成立した法律は、私たちの暮らしに直接関わるものも多くあります。
        </p>
      </div>

      {/* ── 統計カード ── */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <StatMini label="成立" value={stats.enacted} emoji="✅" />
        <StatMini label="可決" value={stats.passed} emoji="🟢" />
        <StatMini label="審議中" value={stats.deliberating} emoji="🟡" />
        <StatMini label="提出" value={stats.submitted} emoji="📝" />
      </div>

      {/* ── 初見向け解説 ── */}
      <AccordionDetails
        title="法案のステータスとは？"
        headerLeft={<span className="text-base">📖</span>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700 mb-1">📝 提出</p>
            <p className="text-sm text-slate-600">
              内閣または議員が国会に法案を出した段階です。まだ本格的な審議には入っていません。
            </p>
          </div>
          <div className="rounded-lg bg-amber-50/60 p-3">
            <p className="text-xs font-semibold text-amber-700 mb-1">🟡 審議中</p>
            <p className="text-sm text-slate-600">
              委員会や本会議で議論されている段階です。修正が入ったり、参考人の意見を聞いたりします。
            </p>
          </div>
          <div className="rounded-lg bg-blue-50/60 p-3">
            <p className="text-xs font-semibold text-blue-700 mb-1">🟢 可決</p>
            <p className="text-sm text-slate-600">
              衆議院または参議院の片方で可決された段階です。もう一方の院でも審議・可決される必要があります。
            </p>
          </div>
          <div className="rounded-lg bg-green-50/60 p-3">
            <p className="text-xs font-semibold text-green-700 mb-1">✅ 成立</p>
            <p className="text-sm text-slate-600">
              両院で可決されて法律として成立した状態です。公布・施行を経て実際に効力を持ちます。
            </p>
          </div>
        </div>
      </AccordionDetails>

      {/* ── フィルタ ── */}
      <div className="mt-6 mb-4 space-y-3" id="filters">
        {/* ステータスタブ */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => {
            const isActive = activeStatus === tab.key;
            const count = countMap[tab.key] ?? 0;
            return (
              <Link
                key={tab.key}
                href={buildHref({ status: tab.key })}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-slate-800 text-white shadow-sm"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                }`}
              >
                <span>{tab.emoji}</span>
                {tab.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs ${
                    isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </div>

        {/* テーマフィルタ */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400">テーマで絞り込み</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref({ theme: "" })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                !activeTheme
                  ? "bg-slate-700 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              すべて
            </Link>
            {THEME_OPTIONS.map((theme) => (
              <Link
                key={theme}
                href={buildHref({ theme: activeTheme === theme ? "" : theme })}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTheme === theme
                    ? "bg-slate-700 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {theme}
              </Link>
            ))}
          </div>
        </div>

        {/* 提出元フィルタ */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400">提出元で絞り込み</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildHref({ submitter: "" })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                !activeSubmitter
                  ? "bg-slate-700 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              すべて
            </Link>
            {SUBMITTER_OPTIONS.map((opt) => (
              <Link
                key={opt.key}
                href={buildHref({ submitter: activeSubmitter === opt.key ? "" : opt.key })}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeSubmitter === opt.key
                    ? "bg-slate-700 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── 件数表示 ── */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {isFiltered
            ? `全${stats.total}件中 ${bills.length}件に絞り込み中`
            : `全${stats.total}件`}
        </p>
        {isFiltered && (
          <Link
            href="/bills"
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            フィルタをリセット
          </Link>
        )}
      </div>

      {/* ── 法案リスト（折りたたみ式） ── */}
      {bills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <span className="text-5xl mb-4">📭</span>
          <p className="text-base">該当する法案がありません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bills.map((bill) => (
            <BillCard
              key={bill.id}
              id={bill.id}
              billCode={bill.billCode}
              title={bill.title}
              summary={bill.summary}
              status={bill.status}
              house={bill.house}
              submittedAt={bill.submittedAt}
              passedAt={bill.passedAt}
              enactedAt={bill.enactedAt}
            />
          ))}
        </div>
      )}

      {/* ── 注記 ── */}
      <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
        <p className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
          <span>⚠️</span> ご注意
        </p>
        <p className="text-sm leading-relaxed text-amber-700">
          法案の概要はAIによる要約です。正確な内容については、国会会議録や官報など一次情報をご確認ください。
          法案データは随時更新されますが、最新の情報とは異なる場合があります。
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// 統計ミニカード
// ──────────────────────────────────────────

function StatMini({
  label,
  value,
  emoji,
}: {
  label: string;
  value: number;
  emoji: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:px-4 sm:py-3">
      <span className="text-lg">{emoji}</span>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}
