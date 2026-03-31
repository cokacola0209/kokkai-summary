import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import PeoplePageClient from "@/components/PeoplePageClient";

export const metadata: Metadata = {
  title: "人物一覧",
  description: "会議に出てきた人物を政党・会派ごとに一覧で見られます。",
};

// build 時の prerender を止めて pool timeout (P2024) を回避する。
// データ取得は unstable_cache (Data Cache) でラップしているため、
// force-dynamic でも revalidate 間隔に1回しか DB を叩かない。
export const dynamic = "force-dynamic";

const getPeopleIndex = unstable_cache(
  async () => {
    const persons = await prisma.person.findMany({
      include: {
        party: {
          select: {
            name: true,
            shortName: true,
            color: true,
          },
        },
        _count: {
          select: { speeches: true },
        },
      },
    });

    return persons
      .filter((p) => p._count.speeches > 0)
      .map((p) => ({
        name: p.name,
        count: p._count.speeches,
        partyName: p.party?.name ?? null,
        partyShortName: p.party?.shortName ?? null,
        partyColor: p.party?.color ?? null,
      }));
  },
  ["people-index"],
  { revalidate: 3600 }
);

export default async function PeoplePage() {
  const people = await getPeopleIndex();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <nav className="mb-4 text-sm text-slate-400">
        <Link href="/" className="transition hover:text-slate-600">
          ホーム
        </Link>{" "}
        /{" "}
        <Link href="/meetings" className="transition hover:text-slate-600">
          会議一覧
        </Link>{" "}
        / <span className="text-slate-600">人物一覧</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">人物一覧</h1>
        <p className="mt-2 text-sm text-slate-500">
          政党・会派ごとに人物をまとめています。タップで展開できます。
        </p>
      </div>

      <PeoplePageClient people={people} />
    </div>
  );
}
