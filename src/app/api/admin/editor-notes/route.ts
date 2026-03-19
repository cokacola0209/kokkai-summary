import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const notes = await prisma.dailyEditorNote.findMany({
    orderBy: { targetDate: "desc" },
    take: 30,
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
