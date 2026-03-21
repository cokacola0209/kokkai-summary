"use client";

import { useState, ReactNode } from "react";

/* ── チェブロンアイコン ── */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
        open ? "rotate-180" : ""
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/* ── アコーディオン ── */
export function Accordion({
  title,
  subtitle,
  badge,
  defaultOpen = false,
  headerLeft,
  children,
}: {
  title: string | ReactNode;
  subtitle?: string | ReactNode;
  badge?: string | ReactNode;
  defaultOpen?: boolean;
  headerLeft?: ReactNode;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-sm">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 sm:px-5"
        aria-expanded={isOpen}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {headerLeft}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {typeof title === "string" ? (
                <span className="text-sm font-bold text-slate-800 sm:text-base">
                  {title}
                </span>
              ) : (
                title
              )}
              {badge && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <div className="mt-1.5 min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">{typeof subtitle === "string" ? (
                <span className="text-xs text-slate-500">{subtitle}</span>
              ) : (
                subtitle
              )}</div>
            )}
          </div>
        </div>
        <ChevronIcon open={isOpen} />
      </button>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── サーバーコンポーネント用 details スタイル ── */
export function AccordionDetails({
  title,
  subtitle,
  badge,
  headerLeft,
  defaultOpen = false,
  children,
}: {
  title: string | ReactNode;
  subtitle?: string | ReactNode;
  badge?: string | ReactNode;
  headerLeft?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-sm"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {headerLeft}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {typeof title === "string" ? (
                <span className="text-sm font-bold text-slate-800 sm:text-base">
                  {title}
                </span>
              ) : (
                title
              )}
              {badge && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <div className="mt-1.5 min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">{typeof subtitle === "string" ? (
                <span className="text-xs text-slate-500">{subtitle}</span>
              ) : (
                subtitle
              )}</div>
            )}
          </div>
        </div>
        <svg
          className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </summary>

      <div className="border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5">
        {children}
      </div>
    </details>
  );
}
