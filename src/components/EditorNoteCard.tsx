import { prisma } from "@/lib/prisma";

export async function EditorNoteCard() {
  const note = await prisma.dailyEditorNote.findFirst({
    where: { status: "published" },
    orderBy: { targetDate: "desc" },
  });

  if (!note) return null;

  const dateStr = note.targetDate.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mb-8 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
          📝 管理者まとめ
        </span>
        <span className="text-xs text-slate-400">{dateStr}</span>
      </div>

      <p className="text-xs text-slate-500 mb-2">
        若年層の方々、政治勉強中の皆様向け
      </p>
      <h2 className="text-lg font-bold text-slate-800 mb-2">
        {note.title || "本日の管理者の総まとめ"}
      </h2>

      {note.introText && (
        <p className="text-sm font-medium text-slate-700 mb-3">
          {note.introText}
        </p>
      )}

      <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
        {note.editedText}
      </p>

      <p className="mt-4 text-[11px] text-slate-400">
        会議の流れをもとに、管理者が初心者向けに整理したメモです
      </p>
    </div>
  );
}
