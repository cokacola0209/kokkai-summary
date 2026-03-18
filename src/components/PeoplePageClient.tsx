"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

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
  isSpecial: boolean; // 無所属・政府参考人等
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
  const [openParties, setOpenParties] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  /* --- 政党グループ化 --- */
  const { partyGroups, specialGroups, topPeople } = useMemo(() => {
    // 政党別にグルーピング
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

    // 各グループ内をあいうえお順ソート
    for (const g of Array.from(groupMap.values())) {
      g.people.sort((a, b) => a.name.localeCompare(b.name, "ja"));
    }

    const allGroups = Array.from(groupMap.values());

    // 通常政党と特殊グループに分離
    const normal = allGroups
      .filter((g) => !g.isSpecial)
      .sort((a, b) => b.people.length - a.people.length);

    const special = allGroups
      .filter((g) => g.isSpecial)
      .sort((a, b) => b.people.length - a.people.length);

    // 注目人物（発言数上位15名）
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

  /* --- 開閉トグル --- */
  const toggleParty = (name: string) => {
    setOpenParties((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  /* --- 検索中は全展開 --- */
  const isSearching = searchQuery.trim().length > 0;

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
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-bold text-slate-700">
          政党・会派別
        </h2>

        {filteredPartyGroups.length === 0 && filteredSpecialGroups.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-400">
            該当する人物が見つかりません
          </p>
        )}

        <div className="space-y-2">
          {filteredPartyGroups.map((group) => {
            const isOpen = isSearching || openParties.has(group.name);
            return (
              <PartySection
                key={group.name}
                group={group}
                isOpen={isOpen}
                onToggle={() => toggleParty(group.name)}
              />
            );
          })}
        </div>

        {/* ── 特殊グループ ── */}
        {filteredSpecialGroups.length > 0 && (
          <>
            <hr className="my-4 border-slate-100" />
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
              その他
            </h3>
            <div className="space-y-2">
              {filteredSpecialGroups.map((group) => {
                const isOpen = isSearching || openParties.has(group.name);
                return (
                  <PartySection
                    key={group.name}
                    group={group}
                    isOpen={isOpen}
                    onToggle={() => toggleParty(group.name)}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- 政党セクション ---------- */
function PartySection({
  group,
  isOpen,
  onToggle,
}: {
  group: PartyGroup;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100">
      {/* ヘッダー（タップで開閉） */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <div className="flex items-center gap-2.5">
          {group.color && (
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: group.color }}
            />
          )}
          <span className="text-sm font-bold text-slate-800">
            {group.shortName ?? group.name}
          </span>
          <span className="text-xs text-slate-400">
            {group.people.length}人
          </span>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* 人物リスト */}
      {isOpen && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
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
        </div>
      )}
    </div>
  );
}
