"use client";

import { useState, useEffect } from "react";

type Note = {
  id: string;
  targetDate: string;
  title: string;
  introText: string;
  aiDraft: string;
  editedText: string;
  status: string;
  suggestedPoints: string[];
  generatedAt: string | null;
  publishedAt: string | null;
};

export default function EditorNotePage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editIntro, setEditIntro] = useState("");
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/editor-notes")
      .then((r) => r.json())
      .then((data) => setNotes(data.notes ?? []));
  }, []);

  function selectNote(note: Note) {
    setSelected(note);
    setEditTitle(note.title);
    setEditIntro(note.introText);
    setEditText(note.editedText || note.aiDraft);
    setMessage("");
  }

  async function handleSave(newStatus?: string) {
    if (!selected) return;
    setSaving(true);
    setMessage("");

    const res = await fetch("/api/admin/editor-notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selected.id,
        title: editTitle,
        introText: editIntro,
        editedText: editText,
        status: newStatus ?? selected.status,
      }),
    });

    if (res.ok) {
      const updated = await res.json();
      setSelected(updated.note);
      setNotes((prev) =>
        prev.map((n) => (n.id === updated.note.id ? updated.note : n))
      );
      setMessage(newStatus === "published" ? "公開しました" : "保存しました");
    } else {
      setMessage("エラーが発生しました");
    }
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        管理者まとめ 編集画面
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        AI下書きを確認・編集して、公開できます。
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 左: 一覧 */}
        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-700">日付一覧</p>
          {notes.length === 0 && (
            <p className="text-sm text-slate-400">
              まだ下書きがありません。
              <br />
              <code className="text-xs">npx tsx src/jobs/generate-editor-note.ts</code>
              <br />
              で生成してください。
            </p>
          )}
          {notes.map((note) => (
            <button
              key={note.id}
              onClick={() => selectNote(note)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                selected?.id === note.id
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <p className="font-medium">
                {new Date(note.targetDate).toLocaleDateString("ja-JP")}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {note.status === "published"
                  ? "✅ 公開中"
                  : note.status === "reviewed"
                  ? "📝 確認済み"
                  : "📄 下書き"}
              </p>
            </button>
          ))}
        </div>

        {/* 右: 編集 */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-400">
              左の一覧から日付を選んでください
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
              {/* AI下書き（参考） */}
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-500">AI下書き（参考）</p>
                <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">
                  {selected.aiDraft}
                </p>
                {selected.suggestedPoints.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selected.suggestedPoints.map((p, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* タイトル */}
              <div>
                <label className="text-xs font-bold text-slate-600">タイトル</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* 冒頭一文 */}
              <div>
                <label className="text-xs font-bold text-slate-600">冒頭の一文</label>
                <input
                  type="text"
                  value={editIntro}
                  onChange={(e) => setEditIntro(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* 本文 */}
              <div>
                <label className="text-xs font-bold text-slate-600">本文（公開される内容）</label>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={6}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* ボタン */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => handleSave()}
                  disabled={saving}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
                >
                  下書き保存
                </button>
                <button
                  onClick={() => handleSave("published")}
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                >
                  公開する
                </button>
                {selected.status === "published" && (
                  <button
                    onClick={() => handleSave("draft")}
                    disabled={saving}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    非公開に戻す
                  </button>
                )}
                {message && (
                  <span className="text-sm text-green-600">{message}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
