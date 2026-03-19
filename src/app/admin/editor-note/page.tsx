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

const STATUS_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  published: { label: "公開中", emoji: "✅", color: "text-green-700 bg-green-50 border-green-200" },
  reviewed: { label: "確認済み", emoji: "📝", color: "text-blue-700 bg-blue-50 border-blue-200" },
  draft: { label: "下書き", emoji: "📄", color: "text-slate-600 bg-slate-100 border-slate-200" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function toDateInputValue(iso: string) {
  return iso.slice(0, 10);
}

export default function EditorNotePage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editIntro, setEditIntro] = useState("");
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  // 新規作成用
  const [newDate, setNewDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [creating, setCreating] = useState(false);

  // データ読み込み
  useEffect(() => {
    fetchNotes();
  }, []);

  async function fetchNotes() {
    const res = await fetch("/api/admin/editor-notes");
    const data = await res.json();
    setNotes(data.notes ?? []);
  }

  function selectNote(note: Note) {
    setSelected(note);
    setEditTitle(note.title);
    setEditIntro(note.introText);
    setEditText(note.editedText || note.aiDraft);
    setMessage("");
  }

  function showMessage(text: string, type: "success" | "error" = "success") {
    setMessage(text);
    setMessageType(type);
    if (type === "success") {
      setTimeout(() => setMessage(""), 3000);
    }
  }

  // ── 新規作成 ──
  async function handleCreate() {
    if (!newDate) return;

    // 既に存在するかチェック
    const existing = notes.find(
      (n) => toDateInputValue(n.targetDate) === newDate
    );
    if (existing) {
      selectNote(existing);
      showMessage("この日付のまとめは既に存在します。選択しました。", "error");
      return;
    }

    setCreating(true);
    showMessage("");

    try {
      const res = await fetch("/api/admin/editor-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate: newDate }),
      });

      const data = await res.json();

      if (!res.ok) {
        showMessage(data.error ?? "作成に失敗しました", "error");
        setCreating(false);
        return;
      }

      // 一覧を再読み込みして新しいノートを選択
      await fetchNotes();
      // 再読み込み後のnotesには反映されないので、直接selectする
      selectNote(data.note);
      showMessage(`${formatDate(data.note.targetDate)} のAI下書きを生成しました（会議 ${data.meetingCount} 件）`);
    } catch (e) {
      showMessage("ネットワークエラーが発生しました", "error");
    }

    setCreating(false);
  }

  // ── AI下書き再生成 ──
  async function handleRegenerate() {
    if (!selected) return;

    const ok = window.confirm(
      "AI下書きを再生成します。現在のAI下書き内容は上書きされます（編集済みの本文はそのまま残ります）。続行しますか？"
    );
    if (!ok) return;

    setCreating(true);
    showMessage("");

    try {
      const dateStr = toDateInputValue(selected.targetDate);
      const res = await fetch("/api/admin/editor-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDate: dateStr }),
      });

      const data = await res.json();

      if (!res.ok) {
        showMessage(data.error ?? "再生成に失敗しました", "error");
        setCreating(false);
        return;
      }

      await fetchNotes();
      selectNote(data.note);
      showMessage("AI下書きを再生成しました");
    } catch (e) {
      showMessage("ネットワークエラーが発生しました", "error");
    }

    setCreating(false);
  }

  // ── 保存 ──
  async function handleSave(newStatus?: string) {
    if (!selected) return;
    setSaving(true);
    showMessage("");

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
      showMessage(
        newStatus === "published"
          ? "公開しました！トップページに反映されます"
          : newStatus === "draft"
            ? "非公開に戻しました"
            : "保存しました"
      );
    } else {
      showMessage("エラーが発生しました", "error");
    }
    setSaving(false);
  }

  // ── AI下書きを本文にコピー ──
  function handleCopyDraftToText() {
    if (!selected) return;
    setEditText(selected.aiDraft);
    showMessage("AI下書きを本文にコピーしました");
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-slate-900">
        📝 管理者まとめ 編集画面
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        日付を指定してAI下書きを生成 → 編集 → 公開の流れです。公開するとトップページに表示されます。
      </p>

      {/* ── メッセージバー ── */}
      {message && (
        <div
          className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
            messageType === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ════════════════════════════════════════ */}
        {/* 左: 新規作成 + 一覧 */}
        {/* ════════════════════════════════════════ */}
        <div className="space-y-4">
          {/* 新規作成 */}
          <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
            <p className="mb-2 text-sm font-bold text-blue-800">
              ✨ 新しいまとめを作成
            </p>
            <p className="mb-3 text-xs text-blue-600">
              日付を指定すると、その日の会議データからAI下書きを自動生成します。
            </p>
            <div className="flex gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
              <button
                onClick={handleCreate}
                disabled={creating || !newDate}
                className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {creating ? "生成中..." : "作成"}
              </button>
            </div>
          </div>

          {/* 日付一覧 */}
          <div>
            <p className="mb-2 text-sm font-bold text-slate-700">
              過去のまとめ（{notes.length}件）
            </p>

            {notes.length === 0 && (
              <p className="text-sm text-slate-400">
                まだまとめがありません。上の「新しいまとめを作成」から始めてください。
              </p>
            )}

            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {notes.map((note) => {
                const isSelected = selected?.id === note.id;
                const st = STATUS_LABELS[note.status] ?? STATUS_LABELS.draft;
                return (
                  <button
                    key={note.id}
                    onClick={() => selectNote(note)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-all ${
                      isSelected
                        ? "border-blue-300 bg-blue-50 shadow-sm"
                        : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-medium ${isSelected ? "text-blue-700" : "text-slate-800"}`}>
                        {formatDate(note.targetDate)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.color}`}
                      >
                        {st.emoji} {st.label}
                      </span>
                    </div>
                    {note.title && (
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {note.title}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════ */}
        {/* 右: 編集エリア */}
        {/* ════════════════════════════════════════ */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="text-lg text-slate-400">📝</p>
              <p className="mt-2 text-sm text-slate-500">
                左の一覧から日付を選ぶか、<br />
                「新しいまとめを作成」で始めてください
              </p>
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
              {/* ヘッダ */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <p className="text-lg font-bold text-slate-800">
                    {formatDate(selected.targetDate)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {selected.generatedAt
                      ? `AI生成: ${new Date(selected.generatedAt).toLocaleString("ja-JP")}`
                      : "AI未生成"}
                    {selected.publishedAt &&
                      ` / 公開: ${new Date(selected.publishedAt).toLocaleString("ja-JP")}`}
                  </p>
                </div>
                {(() => {
                  const st = STATUS_LABELS[selected.status] ?? STATUS_LABELS.draft;
                  return (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${st.color}`}
                    >
                      {st.emoji} {st.label}
                    </span>
                  );
                })()}
              </div>

              {/* AI下書き（参考） */}
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-500">
                    🤖 AI下書き（参考）
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopyDraftToText}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition-colors hover:bg-slate-100"
                    >
                      本文にコピー
                    </button>
                    <button
                      onClick={handleRegenerate}
                      disabled={creating}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
                    >
                      {creating ? "生成中..." : "再生成"}
                    </button>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
                  {selected.aiDraft || "（未生成）"}
                </p>
                {selected.suggestedPoints.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {selected.suggestedPoints.map((p, i) => (
                      <span
                        key={i}
                        className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] text-slate-600"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* タイトル */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  タイトル
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="例: 6月5日の国会は11件の会議"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* 冒頭一文 */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  冒頭の一文
                </label>
                <input
                  type="text"
                  value={editIntro}
                  onChange={(e) => setEditIntro(e.target.value)}
                  placeholder="例: 複数の委員会で様々なテーマが同時進行中です"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* 本文 */}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  本文（公開される内容）
                </label>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={8}
                  placeholder="ここに書いた内容がトップページに表示されます"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
                <p className="mt-1 text-right text-xs text-slate-400">
                  {editText.length} 文字
                </p>
              </div>

              {/* プレビュー */}
              {editText && (
                <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-white p-4">
                  <p className="mb-2 text-xs font-bold text-blue-600">
                    👁 プレビュー（トップページでの表示イメージ）
                  </p>
                  <p className="text-xs text-slate-500 mb-1">
                    若年層の方々、政治勉強中の皆様向け
                  </p>
                  <p className="text-base font-bold text-slate-800 mb-1">
                    {editTitle || "（タイトル未入力）"}
                  </p>
                  {editIntro && (
                    <p className="text-sm font-medium text-slate-700 mb-2">
                      {editIntro}
                    </p>
                  )}
                  <p className="text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
                    {editText}
                  </p>
                </div>
              )}

              {/* ボタン */}
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <button
                  onClick={() => handleSave()}
                  disabled={saving}
                  className="rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "下書き保存"}
                </button>
                <button
                  onClick={() => handleSave("published")}
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "✅ 公開する"}
                </button>
                {selected.status === "published" && (
                  <button
                    onClick={() => handleSave("draft")}
                    disabled={saving}
                    className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                  >
                    非公開に戻す
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
