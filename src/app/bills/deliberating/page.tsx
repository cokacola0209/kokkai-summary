import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BillCard, BILL_THEMES, getSubmitterType } from "@/components/BillCard";
import { AccordionDetails } from "@/components/Accordion";

export const dynamic = "force-dynamic";

const PER_PAGE = 15;

export const metadata: Metadata = {
  title: "審議中の法案 – 国会ラボ",
  description:
    "国会で現在審議されている法案や、提出された法案の一覧です。今なにが議論されているかを確認できます。",
};

// ──────────────────────────────────────────
// フィルタ定義
// ※ /bills/page.tsx と同一定義（将来の共通化候補）
// ──────────────────────────────────────────

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

/** DB 内の審議中・提出法案から年の候補を動的に取得 */
async function getAvailableYears(): Promise<number[]> {
  const bills = await prisma.bill.findMany({
    where: { status: { in: ["deliberating", "submitted"] } },
    select: { submittedAt: true },
  });
  const years = new Set<number>();
  for (const b of bills) {
    if (b.submittedAt) years.add(b.submittedAt.getFullYear());
  }
  return Array.from(years).sort((a, b) => b - a);
}

async function getBills(year?: number) {
  const where: Record<string, unknown> = {
    status: { in: ["deliberating", "submitted"] },
  };

  if (year) {
    const start = new Date(`${year}-01-01`);
    const end = new Date(`${year + 1}-01-01`);
    where.submittedAt = { gte: start, lt: end };
  }

  return prisma.bill.findMany({
    where,
    orderBy: [
      { submittedAt: { sort: "desc", nulls: "last" } },
      { billCode: "desc" },
    ],
    include: {
      _count: {
        select: { meetings: true },
      },
    },
  });
}

async function getBillStats() {
  const [deliberating, submitted] = await Promise.all([
    prisma.bill.count({ where: { status: "deliberating" } }),
    prisma.bill.count({ where: { status: "submitted" } }),
  ]);
  return { total: deliberating + submitted, deliberating, submitted };
}

// ──────────────────────────────────────────
// ページ
// ──────────────────────────────────────────

interface Props {
  searchParams?: {
    year?: string;
    theme?: string;
    submitter?: string;
    page?: string;
  };
}

export default async function DeliberatingBillsPage({ searchParams }: Props) {
  const activeYear = searchParams?.year ?? "";
  const activeTheme = searchParams?.theme ?? "";
  const activeSubmitter = searchParams?.submitter ?? "";

  const yearNum = activeYear ? parseInt(activeYear, 10) : undefined;
  const validYear = yearNum && !isNaN(yearNum) ? yearNum : undefined;

  const [allBills, stats, availableYears] = await Promise.all([
    getBills(validYear),
    getBillStats(),
    getAvailableYears(),
  ]);

  // ── フィルタ件数の計算（クロスフィルタ） ──

  const billsForThemeCount = activeSubmitter
    ? allBills.filter((b) => getSubmitterType(b.billCode) === activeSubmitter)
    : allBills;

  const billsForSubmitterCount = activeTheme
    ? (() => {
        const kw = BILL_THEMES[activeTheme];
        return kw
          ? allBills.filter((b) => {
              const t = `${b.title} ${b.summary}`;
              return kw.some((k) => t.includes(k));
            })
          : allBills;
      })()
    : allBills;

  const themeCounts: Record<string, number> = {};
  for (const theme of THEME_OPTIONS) {
    const kw = BILL_THEMES[theme];
    if (kw) {
      themeCounts[theme] = billsForThemeCount.filter((b) => {
        const t = `${b.title} ${b.summary}`;
        return kw.some((k) => t.includes(k));
      }).length;
    }
  }

  const submitterCounts: Record<string, number> = {};
  for (const opt of SUBMITTER_OPTIONS) {
    submitterCounts[opt.key] = billsForSubmitterCount.filter(
      (b) => getSubmitterType(b.billCode) === opt.key,
    ).length;
  }

  // ── フィルタ適用 ──

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

  if (activeSubmitter) {
    bills = bills.filter((bill) => getSubmitterType(bill.billCode) === activeSubmitter);
  }

  // ── ページネーション ──
  const totalFiltered = bills.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PER_PAGE));
  const rawPage = parseInt(searchParams?.page ?? "1", 10);
  const currentPage = Math.max(1, Math.min(isNaN(rawPage) ? 1 : rawPage, totalPages));
  const startIndex = (currentPage - 1) * PER_PAGE;
  const pagedBills = bills.slice(startIndex, startIndex + PER_PAGE);

  // ── URL構築ヘルパー ──
  function buildFilterHref(overrides: Record<string, string>) {
    const params = new URLSearchParams();
    const merged = {
      year: activeYear,
      theme: activeTheme,
      submitter: activeSubmitter,
      ...overrides,
    };
    if (merged.year) params.set("year", merged.year);
    if (merged.theme) params.set("theme", merged.theme);
    if (merged.submitter) params.set("submitter", merged.submitter);
    return `/bills/deliberating${params.toString() ? `?${params}` : ""}`;
  }

  function buildPageHref(page: number) {
    const params = new URLSearchParams();
    if (activeYear) params.set("year", activeYear);
    if (activeTheme) params.set("theme", activeTheme);
    if (activeSubmitter) params.set("submitter", activeSubmitter);
    if (page > 1) params.set("page", String(page));
    return `/bills/deliberating${params.toString() ? `?${params}` : ""}`;
  }

  const isFiltered = !!activeYear || !!activeTheme || !!activeSubmitter;

  return (
    <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
      {/* パンくず */}
      <nav className="mb-4 text-sm text-slate-400">
        <Link href="/" className="transition hover:text-slate-600">
          ホーム
        </Link>{" "}
        /{" "}
        <Link href="/bills" className="transition hover:text-slate-600">
          国会で決まった法案
        </Link>{" "}
        / <span className="text-slate-600">審議中の法案</span>
      </nav>

      {/* ── ヘッダ ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          🔍 審議中の法案
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          国会に提出され、現在審議が進められている法案の一覧です。
          今後の動向に注目です。
        </p>
        <Link
          href="/bills"
          className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200"
        >
          📜 成立・可決された法案はこちら
          <span className="ml-auto text-slate-400">→</span>
        </Link>
      </div>

      {/* ── 統計カード ── */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:gap-3">
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
        </div>
      </AccordionDetails>

      {/* ── フィルタ ── */}
      <div className="mt-6 mb-4 space-y-3" id="filters">
        {/* 年別フィルタ */}
        {availableYears.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">提出年で絞り込み</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildFilterHref({ year: "" })}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  !activeYear
                    ? "bg-slate-700 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                すべて
              </Link>
              {availableYears.map((y) => (
                <Link
                  key={y}
                  href={buildFilterHref({ year: activeYear === String(y) ? "" : String(y) })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeYear === String(y)
                      ? "bg-slate-700 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {y}年
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* テーマフィルタ */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400">テーマで絞り込み</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildFilterHref({ theme: "" })}
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
                href={buildFilterHref({ theme: activeTheme === theme ? "" : theme })}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeTheme === theme
                    ? "bg-slate-700 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {theme}
                <span className="ml-1 opacity-60">({themeCounts[theme] ?? 0})</span>
              </Link>
            ))}
          </div>
        </div>

        {/* 提出元フィルタ */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-400">提出元で絞り込み</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={buildFilterHref({ submitter: "" })}
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
                href={buildFilterHref({ submitter: activeSubmitter === opt.key ? "" : opt.key })}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  activeSubmitter === opt.key
                    ? "bg-slate-700 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {opt.label}
                <span className="ml-1 opacity-60">({submitterCounts[opt.key] ?? 0})</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── 件数表示 ── */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {totalFiltered === 0
            ? "該当なし"
            : isFiltered
              ? `全${stats.total}件中 ${totalFiltered}件に絞り込み中（${startIndex + 1}〜${Math.min(startIndex + PER_PAGE, totalFiltered)}件を表示）`
              : `全${stats.total}件（${startIndex + 1}〜${Math.min(startIndex + PER_PAGE, totalFiltered)}件を表示）`}
        </p>
        {isFiltered && (
          <Link
            href="/bills/deliberating"
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            フィルタをリセット
          </Link>
        )}
      </div>

      {/* ── 法案リスト（折りたたみ式） ── */}
      {pagedBills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <span className="text-5xl mb-4">📭</span>
          <p className="text-base">該当する法案がありません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pagedBills.map((bill) => (
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

      {/* ── ページネーション ── */}
      {totalPages > 1 && (
        <nav className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
          {currentPage > 1 && (
            <Link
              href={buildPageHref(currentPage - 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50"
            >
              ← 前へ
            </Link>
          )}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={buildPageHref(p)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                p === currentPage
                  ? "bg-slate-800 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p}
            </Link>
          ))}
          {currentPage < totalPages && (
            <Link
              href={buildPageHref(currentPage + 1)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50"
            >
              次へ →
            </Link>
          )}
        </nav>
      )}

      {/* ── 注記 ── */}
      <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
        <p className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
          <span>⚠️</span> ご注意
        </p>
        <p className="text-sm leading-relaxed text-amber-700">
          法案の概要はAIによる要約です。正確な内容については、国会会議録や官報など一次情報をご確認ください。
          審議状況は随時更新されますが、最新の情報とは異なる場合があります。
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// 統計ミニカード
// ※ 将来の共通化候補（/bills/page.tsx にも同定義あり）
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
