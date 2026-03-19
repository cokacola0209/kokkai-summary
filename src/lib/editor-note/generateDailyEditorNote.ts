import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `あなたは「国会ラボ」という若者向け政治情報サイトの編集アシスタントです。
管理者が毎日公開する「初心者向け編集メモ」の下書きを作成してください。

【絶対ルール】
- 強い政治主張をしない
- 党や議員を断罪・批判しない
- 善悪判定をしない
- 思想を押しつけない
- 上から目線にしない
- 怒りや感情で引っ張らない
- 説教くさくしない
- 難しい用語はできるだけ避ける

【文体】
- 政治に詳しくない管理者が、できるだけ分かりやすく整理してくれている温度感
- 若者向けだが軽薄にしない
- ニュースメディア口調だけにも寄せない
- 断定より「〜が議論されました」「〜が注目されています」のような表現

【出力内容】
以下のJSON形式で返してください。JSONのみ出力し、他の文章は一切含めないでください。

{
  "title": "その日のまとめタイトル（15文字以内）",
  "introText": "冒頭の一文（30文字以内、その日の全体像を一言で）",
  "aiDraft": "本文（3〜5文、200文字程度。その日いちばん大きかった論点、初心者ならここだけ見ればいい点、明日以降どこを見ると流れが分かるかの3点が自然に伝わるように）",
  "suggestedPoints": ["ポイント1", "ポイント2", "ポイント3"]
}`;

export async function generateDailyEditorNote(targetDate?: Date) {
  const date = targetDate ?? new Date();
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  // 対象日の会議と要約を取得
  const meetings = await prisma.meeting.findMany({
    where: { date: { gte: dayStart, lt: dayEnd } },
    include: {
      summary: true,
      _count: { select: { speeches: true } },
    },
    orderBy: { nameOfMeeting: "asc" },
  });

  if (meetings.length === 0) {
    console.log(`[EditorNote] ${dayStart.toISOString().slice(0, 10)}: 会議なし、スキップ`);
    return null;
  }

  // 要約情報を整理
  const summaryTexts = meetings
    .filter((m) => m.summary)
    .map((m) => {
      const s = m.summary!;
      return [
        `【${m.house} ${m.nameOfMeeting}】`,
        s.bullets.length > 0 ? `要点: ${s.bullets.slice(0, 3).join(" / ")}` : "",
        s.agreementPoints.length > 0 ? `決定事項: ${s.agreementPoints.slice(0, 2).join(" / ")}` : "",
        s.conflictPoints.length > 0 ? `争点: ${s.conflictPoints.slice(0, 2).join(" / ")}` : "",
        s.impactNotes.length > 0 ? `影響: ${s.impactNotes.slice(0, 1).join(" / ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const dateStr = dayStart.toLocaleDateString("ja-JP");
  const userPrompt = `${dateStr}の国会で${meetings.length}件の会議がありました。以下がその要約です。

${summaryTexts}

この内容をもとに、若者・政治初心者向けの「管理者編集メモ」の下書きを作成してください。`;

  // Anthropic API 呼び出し
  const client = new Anthropic();
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // JSON パース
  let parsed: {
    title: string;
    introText: string;
    aiDraft: string;
    suggestedPoints: string[];
  };

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error("[EditorNote] JSON parse failed:", text.slice(0, 200));
    parsed = {
      title: `${dateStr}のまとめ`,
      introText: "本日の国会の概要です。",
      aiDraft: text.slice(0, 300),
      suggestedPoints: [],
    };
  }

  // DB に保存（upsert）
  const note = await prisma.dailyEditorNote.upsert({
    where: { targetDate: dayStart },
    create: {
      targetDate: dayStart,
      title: parsed.title,
      introText: parsed.introText,
      aiDraft: parsed.aiDraft,
      editedText: parsed.aiDraft, // 初期値はAI下書きをコピー
      suggestedPoints: parsed.suggestedPoints,
      status: "draft",
      generatedAt: new Date(),
    },
    update: {
      title: parsed.title,
      introText: parsed.introText,
      aiDraft: parsed.aiDraft,
      suggestedPoints: parsed.suggestedPoints,
      generatedAt: new Date(),
    },
  });

  console.log(`[EditorNote] ${dateStr}: 下書き生成完了 (id: ${note.id})`);
  return note;
}
