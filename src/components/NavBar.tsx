// src/components/NavBar.tsx
import Link from "next/link";

export function NavBar() {
  return (
    <header className="sticky top-0 z-50 border-b bg-[#1a2744] text-white shadow">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <span className="text-red-400">🏛</span>
          国会ラボ ～議事録ダイジェスト～
        </Link>
        <nav className="flex gap-6 text-sm font-medium">
          <Link href="/" className="hover:text-slate-300 transition">
            今日のまとめ
          </Link>
          <Link href="/meetings" className="hover:text-slate-300 transition">
            会議一覧
          </Link>
        </nav>
      </div>
    </header>
  );
}
