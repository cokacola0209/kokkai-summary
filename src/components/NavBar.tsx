"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavBar() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // ページ遷移時に閉じる
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // メニュー外クリックで閉じる
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-700/30 bg-[#1a2744] text-white shadow-lg">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-90 transition"
        >
          <span className="text-red-400">🏛</span>
          国会ラボ 〜議事録ダイジェスト〜
        </Link>

        {/* メニュー */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setOpen((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/10"
            aria-expanded={open}
            aria-haspopup="true"
          >
            メニュー
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              <nav className="py-1">
                <Link
                  href="/meetings#filters"
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <span className="text-base">🔍</span>
                  会議検索
                </Link>
                <Link
                  href="/meetings"
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <span className="text-base">📋</span>
                  会議一覧
                </Link>
                <Link
                  href="/"
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <span className="text-base">📅</span>
                  直近のまとめ
                </Link>
              </nav>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
