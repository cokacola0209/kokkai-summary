import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "人物一覧 | 国会ラボ",
  description: "会議に出てくる人物を一覧で見られます。",
};

export const revalidate = 3600;

function normalizeSpeakerName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .replace(/君$/g, "")
    .replace(/議員$/g, "")
    .replace(/委員長$/g, "")
    .replace(/委員$/g, "")
    .replace(/参考人$/g, "")
    .trim();
}

function isUsefulSpeakerName(name: string): boolean {
  if (!name) return false;
  if (name.length < 2) return false;

  const blocked = [
    "会議録情報",
    "議事日程",
    "発言者",
    "委員会",
    "本会議",
    "理事会",
  ];

  return !blocked.some((word) => name.includes(word));
}

async function getPeopleIndex() {
  const meetings = await prisma.meeting.findMany({
    orderBy: { date: "desc" },
    take: 160,
    include: {
      speeches: {
        select: {
          speaker: true,
        },
        orderBy: { order: "asc" },
        take: 20,
      },
    },
  });

  const counts = new Map<string, number>();

  for (const meeting of meetings) {
    const speakers = new Set(
      meeting.speeches
        .map((speech) => normalizeSpeakerName(speech.speaker))
        .filter(isUsefulSpeakerName)
    );

    for (const speaker of speakers) {
      counts.set(speaker, (counts.get(speaker) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "ja"))
    .map(([name, count]) => ({
      name,
      count,
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
          最近の会議に出てきた人物を、見やすく一覧にしています。
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-700">
            あいうえお順で見られます
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
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                <span>{person.name}</span>
                <span className="text-slate-400">({person.count})</span>
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
