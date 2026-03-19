import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDailyEditorNote } from "@/lib/editor-note/generateDailyEditorNote";

// ──────────────────────────────────────────
// 認証チェック
// ──────────────────────────────────────────
function checkAuth(request: Request): boolean {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return true; // 未設定なら認証なし（後方互換）

  const key = request.headers.get("x-admin-key") ?? "";
  return key === password;
}

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "認証エラー: パスワードが正しくありません" },
    { status: 401 }
  );
}

// ──────────────────────────────────────────
// GET: 一覧取得
// ──────────────────────────────────────────
export async function GET(request: Request) {
  if (!checkAuth(request)) return unauthorizedResponse();

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
  if (!checkAuth(request)) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { targetDate } = body;

    if (!targetDate) {
      return NextResponse.json(
        { error: "targetDate is required (例: 2026-03-10)" },
        { status: 400 }
      );
    }

    const parts = targetDate.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return NextResponse.json(
        { error: "日付の形式が正しくありません（例: 2026-03-10）" },
        { status: 400 }
      );
    }

    const dayStart = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

    const meetingCount = await prisma.meeting.count({
      where: { date: dayStart },
    });

    if (meetingCount === 0) {
      return NextResponse.json(
        {
          error: `${parts[0]}年${parts[1]}月${parts[2]}日の会議データがありません。先に会議データを取得してください。`,
          meetingCount: 0,
        },
        { status: 404 }
      );
    }

    const note = await generateDailyEditorNote(dayStart);

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
  if (!checkAuth(request)) return unauthorizedResponse();

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
