// src/lib/summarizer/index.ts
/**
 * 要約生成モジュール (map-reduce 戦略)
 *
 * 1. Map  : 発言者ごとに発言をまとめてサマリ生成
 * 2. Reduce: 発言者サマリを統合して会議全体サマリ生成
 *
 * 禁止事項:
 *   - 「評価語」(優れた、素晴らしいなど) の使用禁止
 *   - 必ず「根拠(引用)」「影響」「未解決点」を構造化
 *   - 一次情報リンク(会議録URL)を必ず含める
 */

import { prisma } from "@/lib/prisma";
import { callLlm, type LlmMessage } from "./llm";

// ──────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────

interface SpeakerSummary {
  speaker: string;
  group: string | null;
  summary: string;
  quotes: string[]; // 発言原文からの抜粋 (根拠)
}

interface MeetingSummaryJson {
  bullets: string[];
  keyTopics: string[];
  agreementPoints: string[];
  conflictPoints: string[];
  impactNotes: string[];
  speakerSummaries: SpeakerSummary[];
}

// ──────────────────────────────────────────
// プロンプト定数
// ──────────────────────────────────────────

const SYSTEM_PROMPT = `あなたは国会会議録を分析する専門アシスタントです。
【絶対ルール】
- 「優れた」「素晴らしい」「重要な」などの評価語・形容詞は一切使用しない
- 必ず発言原文からの引用(根拠)を含める
- 必ず社会的影響・政策的影響を記述する
- 未解決点・継続審議事項を必ず明記する
- 事実と推測を明確に区別する
- 出力は必ず指定 JSON スキーマに従う`;

const SPEAKER_SUMMARY_PROMPT = (
  speaker: string,
  group: string | null,
  speeches: string[]
) => `
発言者: ${speaker}${group ? ` (${group})` : ""}
発言回数: ${speeches.length}

--- 発言全文 ---
${speeches.map((s, i) => `[発言${i + 1}]\n${s}`).join("\n\n")}
--- ここまで ---

以下の JSON スキーマで発言者サマリを生成してください:
{
  "summary": "発言者の主張・立場を200字以内で要約 (評価語禁止・引用必須)",
  "quotes": ["重要発言の原文抜粋1", "重要発言の原文抜粋2"] // 最大3点
}

JSON のみ出力してください。前置き・コードブロック記号不要。
`;

const MEETING_SUMMARY_PROMPT = (
  nameOfMeeting: string,
  house: string,
  date: string,
  speakerSummaries: SpeakerSummary[],
  meetingUrl: string
) => `
会議名: ${house} ${nameOfMeeting} (${date})
一次情報: ${meetingUrl}

--- 発言者別サマリ ---
${speakerSummaries
  .map(
    (s) =>
      `【${s.speaker}${s.group ? ` / ${s.group}` : ""}】\n${s.summary}\n引用: ${s.quotes.join(" / ")}`
  )
  .join("\n\n")}
--- ここまで ---

以下の JSON スキーマで会議全体サマリを生成してください:
{
  "bullets": [
    "議題・決議事項を箇条書き。各項目に (根拠: 発言者名「引用」) を付記。3〜7点。"
  ],
  "keyTopics": ["タグ形式のキートピック。5〜10点。"],
  "agreementPoints": [
    "合意・可決・採択された事項。根拠となる発言者名を付記。なければ空配列。"
  ],
  "conflictPoints": [
    "対立点・論争点・未解決事項。対立する発言者名を明記。なければ空配列。"
  ],
  "impactNotes": [
    "社会的・政策的・経済的影響の記述。推測の場合は「〜と考えられる」と明記。"
  ]
}

JSON のみ出力してください。前置き・コードブロック記号不要。
`;

// ──────────────────────────────────────────
// ヘルパー
// ──────────────────────────────────────────

function safeParseJson<T>(text: string, fallback: T): T {
  try {
    // コードブロック除去
    const cleaned = text
  .replace(/```json\n?/g, "")
  .replace(/```\n?/g, "")
  .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    // フォールバック: テキスト内から {...} を直接探す
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]) as T;
      }
    } catch {
      // それでもダメなら諦める
    }
    console.warn("[Summarizer] JSON parse failed:", text.slice(0, 200));
    return fallback;
  }
}

/** 発言テキストを MAX_CHARS 以内に切り詰め */
function truncateSpeeches(speeches: string[], maxCharsTotal = 6000): string[] {
  const result: string[] = [];
  let total = 0;
  for (const s of speeches) {
    if (total + s.length > maxCharsTotal) {
      result.push(s.slice(0, maxCharsTotal - total) + "…(省略)");
      break;
    }
    result.push(s);
    total += s.length;
  }
  return result;
}

// ──────────────────────────────────────────
// Map フェーズ: 発言者ごとサマリ
// ──────────────────────────────────────────

async function mapSpeakerSummaries(
  speeches: Array<{ speaker: string; speakerGroup: string | null; text: string }>
): Promise<{ summaries: SpeakerSummary[]; modelUsed: string }> {
  // 発言者でグループ化
  const speakerMap = new Map<
    string,
    { group: string | null; texts: string[] }
  >();

  for (const s of speeches) {
    const key = s.speaker;
    if (!speakerMap.has(key)) {
      speakerMap.set(key, { group: s.speakerGroup, texts: [] });
    }
    speakerMap.get(key)!.texts.push(s.text);
  }

  const summaries: SpeakerSummary[] = [];
  let modelUsed = "unknown";

  for (const [speaker, { group, texts }] of Array.from(speakerMap.entries())) {
    // 委員長・議長などの議事進行発言は短ければスキップ
    const totalText = texts.join("").length;
    if (totalText < 50) {
      summaries.push({ speaker, group, summary: "（議事進行のみ）", quotes: [] });
      continue;
    }

    const truncated = truncateSpeeches(texts);
    const messages: LlmMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: SPEAKER_SUMMARY_PROMPT(speaker, group, truncated) },
    ];

    const result = await callLlm(messages, { maxTokens: 600, temperature: 0.1 });
    modelUsed = result.modelUsed;

    const parsed = safeParseJson<{ summary: string; quotes: string[] }>(
      result.text,
      { summary: result.text.slice(0, 200), quotes: [] }
    );

    summaries.push({
      speaker,
      group,
      summary: parsed.summary ?? "",
      quotes: parsed.quotes ?? [],
    });
  }

  return { summaries, modelUsed };
}

// ──────────────────────────────────────────
// Reduce フェーズ: 会議全体サマリ
// ──────────────────────────────────────────

async function reduceMeetingSummary(
  meeting: { nameOfMeeting: string; house: string; date: string; url: string },
  speakerSummaries: SpeakerSummary[]
): Promise<{ json: MeetingSummaryJson; modelUsed: string }> {
  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: MEETING_SUMMARY_PROMPT(
        meeting.nameOfMeeting,
        meeting.house,
        meeting.date,
        speakerSummaries,
        meeting.url
      ),
    },
  ];

  const result = await callLlm(messages, { maxTokens: 4000, temperature: 0.1 });

  const parsed = safeParseJson<Omit<MeetingSummaryJson, "speakerSummaries">>(
    result.text,
    {
      bullets: ["要約生成に失敗しました"],
      keyTopics: [],
      agreementPoints: [],
      conflictPoints: [],
      impactNotes: [],
    }
  );

  return {
    json: { ...parsed, speakerSummaries },
    modelUsed: result.modelUsed,
  };
}

// ──────────────────────────────────────────
// 公開 API
// ──────────────────────────────────────────

export async function generateSummary(meetingId: string): Promise<void> {
  // DB から会議・発言を取得
  const meeting = await prisma.meeting.findUniqueOrThrow({
    where: { id: meetingId },
    include: {
      speeches: { orderBy: { order: "asc" } },
    },
  });

  if (meeting.speeches.length === 0) {
    console.warn(`[Summarizer] No speeches for ${meetingId}, skipping.`);
    return;
  }

  // Map
  const { summaries: speakerSummaries, modelUsed: mapModel } =
    await mapSpeakerSummaries(meeting.speeches);

  // Reduce
  const { json, modelUsed: reduceModel } = await reduceMeetingSummary(
    {
      nameOfMeeting: meeting.nameOfMeeting,
      house: meeting.house,
      date: meeting.date.toISOString().split("T")[0],
      url: meeting.url,
    },
    speakerSummaries
  );

  // DB 保存
  await prisma.summary.upsert({
    where: { meetingId },
    create: {
      meetingId,
      bullets: json.bullets,
      keyTopics: json.keyTopics,
      agreementPoints: json.agreementPoints,
      conflictPoints: json.conflictPoints,
      impactNotes: json.impactNotes,
      speakerSummaries: json.speakerSummaries as object[],
      sourceLinks: [meeting.url],
      modelUsed: reduceModel || mapModel,
    },
    update: {
      bullets: json.bullets,
      keyTopics: json.keyTopics,
      agreementPoints: json.agreementPoints,
      conflictPoints: json.conflictPoints,
      impactNotes: json.impactNotes,
      speakerSummaries: json.speakerSummaries as object[],
      sourceLinks: [meeting.url],
      modelUsed: reduceModel || mapModel,
      updatedAt: new Date(),
    },
  });
}

/** 特定会議の要約を再生成 */
export async function regenerateSummary(meetingId: string): Promise<void> {
  await prisma.summary.deleteMany({ where: { meetingId } });
  await generateSummary(meetingId);
}
