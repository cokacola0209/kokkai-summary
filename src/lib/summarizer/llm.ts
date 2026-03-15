// src/lib/summarizer/llm.ts
/**
 * LLM プロバイダ抽象レイヤー
 * 環境変数 LLM_PROVIDER で切り替え:
 *   - "openai"    : OpenAI Chat Completions API (デフォルト)
 *   - "anthropic" : Anthropic Messages API
 *   - "stub"      : テスト用スタブ (API 呼び出しなし)
 */

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmResult {
  text: string;
  modelUsed: string;
}

// ──────────────────────────────────────────
// Provider implementations
// ──────────────────────────────────────────

async function callOpenAI(
  messages: LlmMessage[],
  opts: LlmOptions
): Promise<LlmResult> {
  const model = opts.model ?? process.env.OPENAI_MODEL ?? "gpt-4o";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 2000,
      temperature: opts.temperature ?? 0.2,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    text: data.choices[0].message.content as string,
    modelUsed: model,
  };
}

async function callAnthropic(
  messages: LlmMessage[],
  opts: LlmOptions
): Promise<LlmResult> {
  const model =
    opts.model ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20241022";
  const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
  const userMessages = messages.filter((m) => m.role !== "system");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: systemMsg,
      messages: userMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: opts.maxTokens ?? 2000,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return {
    text: data.content[0].text as string,
    modelUsed: model,
  };
}

function callStub(messages: LlmMessage[]): LlmResult {
  const userText = messages.find((m) => m.role === "user")?.content ?? "";
  return {
    text: JSON.stringify({
      bullets: ["（スタブ）発言内容の要約1", "（スタブ）発言内容の要約2"],
      keyTopics: ["テスト", "スタブ"],
      agreementPoints: ["（スタブ）合意事項"],
      conflictPoints: ["（スタブ）対立点"],
      impactNotes: ["（スタブ）影響・注目点"],
      speakerSummaries: [],
    }),
    modelUsed: "stub",
  };
}

// ──────────────────────────────────────────
// 公開 API
// ──────────────────────────────────────────

export async function callLlm(
  messages: LlmMessage[],
  opts: LlmOptions = {}
): Promise<LlmResult> {
  const provider =
    (process.env.LLM_PROVIDER as "openai" | "anthropic" | "stub") ?? "openai";

  switch (provider) {
    case "anthropic":
      return callAnthropic(messages, opts);
    case "stub":
      return callStub(messages);
    case "openai":
    default:
      return callOpenAI(messages, opts);
  }
}
