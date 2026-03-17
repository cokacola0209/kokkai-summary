import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "人物一覧",
  description: "会議に出てきた人物を一覧で見られます。",
};

export const revalidate = 3600;

async function getPeopleIndex() {
  // Person テーブルから直接取得（バックフィル済み）
  const persons = await prisma.person.findMany({
    include: {
      party: {
        select: {
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
    .sort((a, b) => a.name.localeCompare(b.name, "ja"))
    .map((p) => ({
      name: p.name,
      count: p._count.speeches,
      partyShortName: p.party?.shortName ?? null,
      partyColor: p.party?.color ?? null,
    }));
}

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
          最近の会議に出てきた人物を、所属会派つきで一覧にしています。
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-700">
            あいうえお順 · 会派バッジつき
          </p>
          <Link
            href="/meetings"
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            会議一覧へ →
          </Link>
        </div>

        {people.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {people.map((person) => (
              <Link
                key={person.name}
                href={`/meetings?person=${encodeURIComponent(person.name)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                {person.partyColor && (
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: person.partyColor }}
                    title={person.partyShortName ?? ""}
                  />
                )}
                <span>{person.name}</span>
                {person.partyShortName && (
                  <span className="text-slate-400">
                    {person.partyShortName}
                  </span>
                )}
                <span className="text-slate-300">({person.count})</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">人物データはまだ少なめです。</p>
        )}
      </div>
    </div>
  );
}
