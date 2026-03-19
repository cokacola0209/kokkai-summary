import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDailyEditorNote } from "@/lib/editor-note/generateDailyEditorNote";

// ──────────────────────────────────────────
// GET: 一覧取得
// ──────────────────────────────────────────
export async function GET() {
  const notes = await prisma.dailyEditorNote.findMany({
    orderBy: { targetDate: "desc" },
    take: 60,
  });

  return NextResponse.json({
    notes: notes.map((n) => ({
      ...n,
      targetDate: n.targetDate.toISOString(),
      generatedAt: n.generatedAt?.toISOString() ?? null,
      publishedAt: n.publishedAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    })),
  });
}

// ──────────────────────────────────────────
// POST: 新規作成（AI下書き生成）
// ──────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { targetDate } = body;

    if (!targetDate) {
      return NextResponse.json(
        { error: "targetDate is required (例: 2026-03-10)" },
        { status: 400 }
      );
    }

    const date = new Date(targetDate);
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { error: "日付の形式が正しくありません" },
        { status: 400 }
      );
    }

    // その日の会議件数をチェック
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const meetingCount = await prisma.meeting.count({
      where: { date: { gte: dayStart, lt: dayEnd } },
    });

    if (meetingCount === 0) {
      return NextResponse.json(
        {
          error: `${dayStart.toLocaleDateString("ja-JP")} の会議データがありません。先に会議データを取得してください。`,
          meetingCount: 0,
        },
        { status: 404 }
      );
    }

    // AI下書き生成（既存のgenerateDailyEditorNote をそのまま使う）
    const note = await generateDailyEditorNote(date);

    if (!note) {
      return NextResponse.json(
        { error: "下書きの生成に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      note: {
        ...note,
        targetDate: note.targetDate.toISOString(),
        generatedAt: note.generatedAt?.toISOString() ?? null,
        publishedAt: note.publishedAt?.toISOString() ?? null,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      },
      meetingCount,
    });
  } catch (e: unknown) {
    console.error("[POST /api/admin/editor-notes]", e);
    const message = e instanceof Error ? e.message : "不明なエラー";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ──────────────────────────────────────────
// PUT: 既存レコード更新
// ──────────────────────────────────────────
export async function PUT(request: Request) {
  const body = await request.json();
  const { id, title, introText, editedText, status } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const note = await prisma.dailyEditorNote.update({
    where: { id },
    data: {
      title: title ?? undefined,
      introText: introText ?? undefined,
      editedText: editedText ?? undefined,
      status: status ?? undefined,
      publishedAt: status === "published" ? new Date() : undefined,
    },
  });

  return NextResponse.json({
    note: {
      ...note,
      targetDate: note.targetDate.toISOString(),
      generatedAt: note.generatedAt?.toISOString() ?? null,
      publishedAt: note.publishedAt?.toISOString() ?? null,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    },
  });
}
