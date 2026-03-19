"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Accordion } from "@/components/Accordion";

/* ---------- 型定義 ---------- */
type PersonItem = {
  name: string;
  count: number;
  partyShortName: string | null;
  partyColor: string | null;
  partyName: string | null;
};

type PartyGroup = {
  name: string;
  shortName: string | null;
  color: string | null;
  people: PersonItem[];
  isSpecial: boolean;
};

type Props = {
  people: PersonItem[];
};

/* ---------- 特殊グループ判定 ---------- */
const SPECIAL_GROUPS = [
  "無所属",
  "各派に属しない議員",
  "政府参考人",
  "参考人",
  "その他",
];

function isSpecialGroup(name: string | null): boolean {
  if (!name) return true;
  return SPECIAL_GROUPS.some((s) => name.includes(s));
}

/* ---------- メインコンポーネント ---------- */
export default function PeoplePageClient({ people }: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  /* --- 政党グループ化 --- */
  const { partyGroups, specialGroups, topPeople } = useMemo(() => {
    const groupMap = new Map<string, PartyGroup>();

    for (const p of people) {
      const key = p.partyName ?? "所属なし";
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          name: key,
          shortName: p.partyShortName,
          color: p.partyColor,
          people: [],
          isSpecial: isSpecialGroup(p.partyName),
        });
      }
      groupMap.get(key)!.people.push(p);
    }

    for (const g of Array.from(groupMap.values())) {
      g.people.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    }

    const allGroups = Array.from(groupMap.values());

    const normal = allGroups
      .filter((g) => !g.isSpecial)
      .sort((a, b) => b.people.length - a.people.length);

    const special = allGroups
      .filter((g) => g.isSpecial)
      .sort((a, b) => b.people.length - a.people.length);

    const top = [...people]
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return { partyGroups: normal, specialGroups: special, topPeople: top };
  }, [people]);

  /* --- 検索フィルタ --- */
  const filteredPartyGroups = useMemo(() => {
    if (!searchQuery.trim()) return partyGroups;
    const q = searchQuery.trim().toLowerCase();
    return partyGroups
      .map((g) => ({
        ...g,
        people: g.people.filter((p) => p.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.people.length > 0);
  }, [partyGroups, searchQuery]);

  const filteredSpecialGroups = useMemo(() => {
    if (!searchQuery.trim()) return specialGroups;
    const q = searchQuery.trim().toLowerCase();
    return specialGroups
      .map((g) => ({
        ...g,
        people: g.people.filter((p) => p.name.toLowerCase().includes(q)),
      }))
      .filter((g) => g.people.length > 0);
  }, [specialGroups, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  const filteredTotal =
    filteredPartyGroups.reduce((sum, g) => sum + g.people.length, 0) +
    filteredSpecialGroups.reduce((sum, g) => sum + g.people.length, 0);

  return (
    <div className="space-y-6">
      {/* ── 検索 ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <input
          type="text"
          placeholder="人物名で検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {/* ── 件数表示 ── */}
      <p className="text-sm text-slate-500">
        {isSearching
          ? `${people.length}人中 ${filteredTotal}人が一致`
          : `全 ${people.length}人`}
      </p>

      {/* ── 注目の人物（検索中は非表示） ── */}
      {!isSearching && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold text-slate-700">
            🔥 注目の人物
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            発言回数が多い人物です
          </p>
          <div className="flex flex-wrap gap-2">
            {topPeople.map((person) => (
              <Link
                key={person.name}
                href={`/meetings?person=${encodeURIComponent(person.name)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                {person.partyColor && (
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: person.partyColor }}
                  />
                )}
                <span className="font-medium">{person.name}</span>
                <span className="text-slate-400">
                  {person.partyShortName ?? ""}
                </span>
                <span className="text-slate-300">({person.count})</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── 政党・会派別 ── */}
      <div className="space-y-2">
        <h2 className="text-sm font-bold text-slate-700 px-1">
          政党・会派別
        </h2>

        {filteredPartyGroups.length === 0 && filteredSpecialGroups.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-400">
            該当する人物が見つかりません
          </p>
        )}

        {filteredPartyGroups.map((group) => (
          <Accordion
            key={group.name}
            title={group.shortName ?? group.name}
            badge={`${group.people.length}人`}
            defaultOpen={isSearching}
            headerLeft={
              group.color ? (
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
              ) : undefined
            }
          >
            <div className="flex flex-wrap gap-2">
              {group.people.map((person) => (
                <Link
                  key={person.name}
                  href={`/meetings?person=${encodeURIComponent(person.name)}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  <span>{person.name}</span>
                  <span className="text-slate-300">({person.count})</span>
                </Link>
              ))}
            </div>
          </Accordion>
        ))}

        {/* ── 特殊グループ ── */}
        {filteredSpecialGroups.length > 0 && (
          <>
            <h3 className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
              その他
            </h3>
            {filteredSpecialGroups.map((group) => (
              <Accordion
                key={group.name}
                title={group.shortName ?? group.name}
                badge={`${group.people.length}人`}
                defaultOpen={isSearching}
                headerLeft={
                  group.color ? (
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: group.color }}
                    />
                  ) : undefined
                }
              >
                <div className="flex flex-wrap gap-2">
                  {group.people.map((person) => (
                    <Link
                      key={person.name}
                      href={`/meetings?person=${encodeURIComponent(person.name)}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <span>{person.name}</span>
                      <span className="text-slate-300">({person.count})</span>
                    </Link>
                  ))}
                </div>
              </Accordion>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
