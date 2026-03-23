import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BillCard, BILL_THEMES, getSubmitterType } from "@/components/BillCard";
import { AccordionDetails } from "@/components/Accordion";

export const dynamic = "force-dynamic";

const PER_PAGE = 15;

export const metadata: Metadata = {
  title: "国会で決まった法案 – 国会ラボ",
  description:
    "国会で成立・可決された法案の一覧です。どんな法律が決まったのか、テーマや年別で確認できます。",
};

// ──────────────────────────────────────────
// フィルタ定義
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

/** DB 内の成立・可決法案から年の候補を動的に取得 */
async function getAvailableYears(): Promise<number[]> {
  const bills = await prisma.bill.findMany({
    where: { status: { in: ["enacted", "passed"] } },
    select: { enactedAt: true, passedAt: true },
  });
  const years = new Set<number>();
  for (const b of bills) {
    const d = b.enactedAt ?? b.passedAt;
    if (d) years.add(d.getFullYear());
  }
  return Array.from(years).sort((a, b) => b - a);
}

async function getBills(year?: number) {
  const where: Record<string, unknown> = {
    status: { in: ["enacted", "passed"] },
  };

  if (year) {
    const start = new Date(`${year}-01-01`);
    const end = new Date(`${year + 1}-01-01`);
    where.OR = [
      { enactedAt: { gte: start, lt: end } },
      { passedAt: { gte: start, lt: end } },
    ];
  }

  return prisma.bill.findMany({
    where,
    orderBy: [
      { enactedAt: { sort: "desc", nulls: "last" } },
      { passedAt: { sort: "desc", nulls: "last" } },
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
  const enacted = await prisma.bill.count({ where: { status: "enacted" } });
  return { total: enacted, enacted };
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

export default async function BillsPage({ searchParams }: Props) {
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

  // year+submitter 適用済み → テーマ件数計算用
  const billsForThemeCount = activeSubmitter
    ? allBills.filter((b) => getSubmitterType(b.billCode) === activeSubmitter)
    : allBills;

  // year+theme 適用済み → 提出元件数計算用
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
  // フィルタ変更 → page リセット / ページ移動 → フィルタ維持
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
    return `/bills${params.toString() ? `?${params}` : ""}`;
  }

  function buildPageHref(page: number) {
    const params = new URLSearchParams();
    if (activeYear) params.set("year", activeYear);
    if (activeTheme) params.set("theme", activeTheme);
    if (activeSubmitter) params.set("submitter", activeSubmitter);
    if (page > 1) params.set("page", String(page));
    return `/bills${params.toString() ? `?${params}` : ""}`;
  }

  const isFiltered = !!activeYear || !!activeTheme || !!activeSubmitter;

  return (
    <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-8">
      {/* パンくず */}
      <nav className="mb-4 text-sm text-slate-400">
        <Link href="/" className="transition hover:text-slate-600">
          ホーム
        </Link>{" "}
        / <span className="text-slate-600">国会で決まった法案</span>
      </nav>

      {/* ── ヘッダ ── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          📜 国会で決まった法案
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          国会で成立・可決された法案をまとめています。
          成立した法律は、私たちの暮らしに直接関わるものも多くあります。
        </p>
        <Link
          href="/bills/deliberating"
          className="mt-3 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 hover:border-blue-300"
        >
          🔍 審議中・提出済みの法案はこちら
          <span className="ml-auto text-blue-400">→</span>
        </Link>
      </div>

      {/* ── 統計カード ── */}
      <div className="mb-6">
        <StatMini label="成立" value={stats.enacted} emoji="✅" />
      </div>

      {/* ── 初見向け解説 ── */}
      <AccordionDetails
        title="法案のステータスとは？"
        headerLeft={<span className="text-base">📖</span>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
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
        {/* 年別フィルタ */}
        {availableYears.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">年で絞り込み</p>
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
            href="/bills"
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
          このページでは成立・可決された法案を中心に掲載しています。
          法案の概要はAIによる要約です。正確な内容については、国会会議録や官報など一次情報をご確認ください。
          法案データは随時更新されますが、最新の情報とは異なる場合があります。
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// 統計ミニカード
// ※ 将来の共通化候補（deliberating/page.tsx にも同定義あり）
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
