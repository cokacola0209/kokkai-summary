// src/lib/ndl/client.ts
/**
 * NDL 国会会議録検索システム API クライアント
 * - fetch + リトライ (指数バックオフ)
 * - レート制限 (NDL 推奨: 1 req / 1s)
 * - ページネーション自動走査
 */

import type {
  NdlMeetingResponse,
  NdlMeetingRecord,
  FetchMeetingsParams,
} from "@/types/ndl";

const NDL_BASE_URL =
  process.env.NDL_API_BASE_URL ?? "https://kokkai.ndl.go.jp/api";

// NDL は公開 API のため API キー不要。
// ただし利用規約上、過度なアクセスは禁止。
const RATE_LIMIT_MS = Number(process.env.NDL_RATE_LIMIT_MS ?? "1200");
const MAX_RETRIES = Number(process.env.NDL_MAX_RETRIES ?? "3");
const MAX_RECORDS_PER_REQ = 10; // NDL 上限

// ──────────────────────────────────────────
// ユーティリティ
// ──────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  retries = MAX_RETRIES,
  attempt = 0
): Promise<Response> {
  try {
    const res = await fetch(url, {
      headers: {

      },
      // Next.js cache: no-store でバッチ毎に最新取得

    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt < retries) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(
          `[NDL] HTTP ${res.status} – retry ${attempt + 1}/${retries} in ${backoff.toFixed(0)}ms`
        );
        await sleep(backoff);
        return fetchWithRetry(url, retries, attempt + 1);
      }
      throw new Error(`[NDL] HTTP ${res.status} after ${retries} retries: ${url}`);
    }

    if (!res.ok) {
      throw new Error(`[NDL] HTTP ${res.status}: ${url}`);
    }

    return res;
  } catch (err) {
    if (attempt < retries && !(err instanceof Error && err.message.startsWith("[NDL] HTTP"))) {
      const backoff = Math.pow(2, attempt) * 1000;
      console.warn(`[NDL] Fetch error – retry ${attempt + 1}/${retries} in ${backoff}ms`, err);
      await sleep(backoff);
      return fetchWithRetry(url, retries, attempt + 1);
    }
    throw err;
  }
}

function buildUrl(params: Record<string, string | number | undefined>): string {
  const url = new URL(`${NDL_BASE_URL}/meeting`);
  url.searchParams.set("recordPacking", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

// ──────────────────────────────────────────
// 公開 API
// ──────────────────────────────────────────

/**
 * 指定日の会議録を全件取得 (ページネーション対応)
 */
export async function fetchMeetingsByDate(
  params: FetchMeetingsParams
): Promise<NdlMeetingRecord[]> {
  const { date, nameOfHouse, maximumRecords = MAX_RECORDS_PER_REQ } = params;
  const allRecords: NdlMeetingRecord[] = [];
  let startRecord = 1;
  let hasMore = true;

  console.log(`[NDL] Fetching meetings for ${date} ...`);

  while (hasMore) {
    const url = buildUrl({
      from: date,
      until: date,
      nameOfHouse,
      maximumRecords,
      startRecord,
    });

    const res = await fetchWithRetry(url);
    const data: NdlMeetingResponse = await res.json();

    const records = data.meetingRecord ?? [];
    allRecords.push(...records);

    console.log(
      `[NDL] Fetched ${records.length} records (total so far: ${allRecords.length} / ${data.numberOfRecords})`
    );

    if (
      data.nextRecordPosition === null ||
      data.nextRecordPosition > data.numberOfRecords ||
      records.length === 0
    ) {
      hasMore = false;
    } else {
      startRecord = data.nextRecordPosition;
      // レート制限: 次リクエストまで待機
      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log(`[NDL] Done. Total meetings fetched: ${allRecords.length}`);
  return allRecords;
}

/**
 * 会議 ID (issueID) 単体取得
 */
export async function fetchMeetingById(
  issueID: string
): Promise<NdlMeetingRecord | null> {
  const url = buildUrl({ issueID, maximumRecords: 1 });
  const res = await fetchWithRetry(url);
  const data: NdlMeetingResponse = await res.json();
  return data.meetingRecord?.[0] ?? null;
}

/**
 * キーワード検索 (タグ検索ページ用)
 */
export async function searchMeetings(opts: {
  any?: string;
  speaker?: string;
  from?: string;
  until?: string;
  maximumRecords?: number;
  startRecord?: number;
}): Promise<NdlMeetingResponse> {
  const url = buildUrl({
    any: opts.any,
    speaker: opts.speaker,
    from: opts.from,
    until: opts.until,
    maximumRecords: opts.maximumRecords ?? 10,
    startRecord: opts.startRecord ?? 1,
  });
  const res = await fetchWithRetry(url);
  return res.json();
}
