/**
 * 法案データ取得・パースモジュール
 *
 * 衆議院の議案一覧ページ（HTML）をパースし、法案データを抽出する。
 * 現在はローカル保存HTMLを入力にする方式。
 * 将来の live fetch 化に備えて関数を分離している。
 *
 * 対象セクション:
 *   衆法・参法・閣法・予算・条約・承認
 * スキップ（重複のため）:
 *   決算その他・決議・規則・規程・承諾
 */

// ──────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────

export interface ParsedBill {
  billCode: string;      // 例: "217-閣法-1"
  title: string;         // 議案件名
  summary: string;       // 概要（HTML からは取得不可、空文字）
  status: "enacted" | "passed" | "deliberating" | "submitted";
  house: string | null;  // "衆議院" | "参議院" | null
  submittedAt: Date | null;
  passedAt: Date | null;
  enactedAt: Date | null;
  rawSource: string;     // JSON 文字列（取得元情報）
  rawStatus: string;     // 元の審議状況テキスト
}

export interface ParseMeta {
  fileName: string;
  chamber: "衆議院" | "参議院";
  fetchedAt?: string;    // ISO 日付文字列
}

// ──────────────────────────────────────────
// ステータスマッピング
// ──────────────────────────────────────────

const STATUS_MAP: Record<string, ParsedBill["status"] | null> = {
  "成立":              "enacted",
  "両院承認":          "enacted",
  "本院議了":          "enacted",
  "本院可決":          "passed",
  "参議院で審議中":    "deliberating",
  "衆議院で審議中":    "deliberating",
  "衆議院で閉会中審査": "deliberating",
  "参議院で閉会中審査": "deliberating",
  "未了":              "submitted",
  // 以下はスキップ（null を返す）
  "撤回":              null,
  "経過":              null,
  "参議院回付案（同意）": null, // 同一法案の重複行
};

/** ステータス優先度（重複時に高い方を採用） */
const STATUS_PRIORITY: Record<string, number> = {
  enacted: 4,
  passed: 3,
  deliberating: 2,
  submitted: 1,
};

/** 元ステータス → マッピング後ステータス。不明なら "submitted" */
function mapStatus(raw: string): ParsedBill["status"] | null {
  if (raw in STATUS_MAP) return STATUS_MAP[raw];
  // 未知のステータスは submitted として取り込む
  console.warn(`  ⚠ 未知のステータス: "${raw}" → submitted として処理`);
  return "submitted";
}

// ──────────────────────────────────────────
// セクション定義
// ──────────────────────────────────────────

/** パース対象のセクション（caption テキスト → 法案種別） */
const TARGET_SECTIONS: Record<string, string> = {
  "衆法の一覧": "衆法",
  "参法の一覧": "参法",
  "閣法の一覧": "閣法",
  "予算の一覧": "予算",
  "条約の一覧": "条約",
  "承認の一覧": "承認",
};

/** スキップするセクション（重複 or 手続き系） */
// "決算その他", "決議の一覧", "規則の一覧", "規程の一覧", "承諾の一覧"

/** 法案種別 → house のデフォルト値 */
function getHouseForType(billType: string): string | null {
  switch (billType) {
    case "衆法": return "衆議院";
    case "参法": return "参議院";
    default:     return null; // 閣法・予算・条約・承認は院の区別なし
  }
}

// ──────────────────────────────────────────
// HTML パーサー（メイン関数）
// ──────────────────────────────────────────

/**
 * 衆議院の議案一覧HTML をパースして法案データを返す。
 *
 * @param html - UTF-8 で読み込んだ HTML 文字列
 * @param meta - ファイル名・院・取得日などのメタ情報
 * @returns ParsedBill[] - パース結果（重複除去済み）
 */
export function parseBillsFromHtml(
  html: string,
  meta: ParseMeta,
): ParsedBill[] {
  const bills = new Map<string, ParsedBill>(); // billCode → ParsedBill（重複除去用）

  // <caption> タグでセクションを検出し、対象セクションのみパース
  const captionRegex = /<caption[^>]*>(.*?)<\/caption>/gi;
  let match: RegExpExecArray | null;

  while ((match = captionRegex.exec(html)) !== null) {
    const captionText = match[1].trim();
    const billType = TARGET_SECTIONS[captionText];
    if (!billType) continue; // 対象外セクション → スキップ

    // このセクションの <table> 範囲を取得
    const sectionStart = match.index;
    const tableEnd = html.indexOf("</table>", sectionStart);
    if (tableEnd === -1) continue;
    const sectionHtml = html.slice(sectionStart, tableEnd);

    // 各行（<tr valign="top">）をパース
    const rowRegex = /<tr valign="top">(.*?)<\/tr>/gis;
    let rowMatch: RegExpExecArray | null;

    while ((rowMatch = rowRegex.exec(sectionHtml)) !== null) {
      const rowHtml = rowMatch[1];

      // <span class="txt03"> の中身を全て取得
      const cellRegex = /<span class="txt03">(.*?)<\/span>/gis;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(cellMatch[1]);
      }

      // 最低4セル（回次, 番号, 件名, 審議状況）が必要
      if (cells.length < 4) continue;

      const sessionStr = stripTags(cells[0]).trim();
      const numStr = stripTags(cells[1]).trim();
      const title = stripTags(cells[2]).trim();
      const rawStatus = stripTags(cells[3]).trim();

      // 回次が数値でなければヘッダ行 → スキップ
      if (!/^\d+$/.test(sessionStr)) continue;

      const session = parseInt(sessionStr, 10);
      const billCode = `${session}-${billType}-${numStr}`;

      // ステータスマッピング
      const status = mapStatus(rawStatus);
      if (status === null) continue; // 撤回・経過などはスキップ

      // 経過リンクの抽出（rawSource 用）
      let keikaUrl = "";
      if (cells.length > 4) {
        const hrefMatch = cells[4].match(/href="([^"]+)"/);
        if (hrefMatch) {
          keikaUrl = hrefMatch[1];
        }
      }

      // rawSource（取得元情報の JSON 文字列）
      const rawSource = JSON.stringify({
        url: `https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian/kaiji${session}.htm`,
        file: meta.fileName,
        chamber: meta.chamber,
        session,
        billType,
        keikaPath: keikaUrl,
        fetchedAt: meta.fetchedAt ?? new Date().toISOString().slice(0, 10),
      });

      const bill: ParsedBill = {
        billCode,
        title,
        summary: "",           // HTML からは取得不可
        status,
        house: getHouseForType(billType),
        submittedAt: null,     // HTML 一覧には日付情報なし
        passedAt: null,
        enactedAt: null,
        rawSource,
        rawStatus,
      };

      // 重複除去: 同じ billCode で複数行ある場合、ステータス優先度が高い方を採用
      const existing = bills.get(billCode);
      if (existing) {
        const existingPriority = STATUS_PRIORITY[existing.status] ?? 0;
        const newPriority = STATUS_PRIORITY[status] ?? 0;
        if (newPriority <= existingPriority) continue; // 既存の方が優先度高い
      }

      bills.set(billCode, bill);
    }
  }

  return Array.from(bills.values());
}

// ──────────────────────────────────────────
// 将来の live fetch 用スタブ
// ──────────────────────────────────────────

/**
 * 衆議院サイトから直接 HTML を取得してパースする（将来実装）。
 * 現在はスタブ。実装時は fetch → parseBillsFromHtml を呼ぶだけ。
 */
export async function fetchBillsLive(
  _chamber: "衆議院" | "参議院",
  _session: number,
): Promise<ParsedBill[]> {
  throw new Error(
    "fetchBillsLive は未実装です。" +
    "現在は parseBillsFromHtml でローカル HTML を入力してください。"
  );
}

// ──────────────────────────────────────────
// ユーティリティ
// ──────────────────────────────────────────

/** HTML タグを除去してプレーンテキストにする */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

// ──────────────────────────────────────────
// keika HTML 日付パーサー
// ──────────────────────────────────────────

export interface KeikaDates {
  submittedAt: Date | null;  // 衆議院議案受理年月日
  passedAt: Date | null;     // 衆議院審議終了年月日
  enactedAt: Date | null;    // 参議院審議終了年月日
}

/** keika HTML の項目名 → KeikaDates のキー（衆法・閣法用） */
const KEIKA_DATE_KEYS_SHUGIIN: Record<string, keyof KeikaDates> = {
  "衆議院議案受理年月日": "submittedAt",
  "衆議院審議終了年月日／衆議院審議結果": "passedAt",
  "参議院審議終了年月日／参議院審議結果": "enactedAt",
};

/** keika HTML の項目名 → KeikaDates のキー（参法用：受理→通過→成立が逆） */
const KEIKA_DATE_KEYS_SANGIIN: Record<string, keyof KeikaDates> = {
  "参議院議案受理年月日": "submittedAt",
  "参議院審議終了年月日／参議院審議結果": "passedAt",
  "衆議院審議終了年月日／衆議院審議結果": "enactedAt",
};

/**
 * keika（経過情報）HTML から日付を抽出する。
 *
 * HTML 全体の <tr> 行を直接走査し、既知の項目名を含む
 * key-value 行から日付を読み取る。
 * テーブルのネスト構造に依存しないため、レイアウト table があっても動作する。
 *
 * @param html - keika HTML 文字列
 * @param billType - 法案種別（"衆法" | "閣法" | "参法" など）。参法は日付マッピングが逆。
 */
export function parseDatesFromKeikaHtml(html: string, billType?: string): KeikaDates {
  const result: KeikaDates = {
    submittedAt: null,
    passedAt: null,
    enactedAt: null,
  };

  const dateKeys = billType === "参法" ? KEIKA_DATE_KEYS_SANGIIN : KEIKA_DATE_KEYS_SHUGIIN;

  // HTML 全体から全 <tr> 行を走査（テーブル境界に依存しない）
  const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowContent = rowMatch[1];

    // <td> または <th> セルを抽出
    const cellRegex = /<t[dh][^>]*>(.*?)<\/t[dh]>/gis;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.push(stripTags(cellMatch[1]).trim());
    }

    if (cells.length < 2) continue;

    const key = normalizeKey(cells[0]);
    const value = cells[1];

    // 対象の項目名かチェック（正規化後で比較）
    const dateKey = matchDateKey(key, dateKeys);
    if (!dateKey) continue;

    // 「／」区切りがある場合は前半（日付部分）だけ取る
    // 例: "令和 7年 3月 4日 ／ 可決" → "令和 7年 3月 4日"
    const dateText = value.split("／")[0].trim();
    if (!dateText) continue;

    // 和暦日付を Date に変換
    const date = parseJapaneseDate(dateText);
    if (date) {
      result[dateKey] = date;
    }
  }

  return result;
}

/** キーを正規化: 全角スペース・半角スペース・改行・タブを除去 */
function normalizeKey(raw: string): string {
  return raw.replace(/[\s\u3000\n\r\t]+/g, "");
}

/** 正規化済みキーを指定のキーマップと照合 */
function matchDateKey(normalizedKey: string, dateKeys: Record<string, keyof KeikaDates>): keyof KeikaDates | null {
  for (const [rawKey, field] of Object.entries(dateKeys)) {
    if (normalizeKey(rawKey) === normalizedKey) return field;
  }
  return null;
}

// ──────────────────────────────────────────
// 和暦→Date 変換
// ──────────────────────────────────────────

/** 元号の開始年（西暦） */
const ERA_BASE: Record<string, number> = {
  "令和": 2018,   // 令和1年 = 2019年
  "平成": 1988,   // 平成1年 = 1989年
  "昭和": 1925,   // 昭和1年 = 1926年
};

/**
 * 和暦文字列を Date に変換する。
 * 例: "令和７年１月２４日" → new Date("2025-01-24")
 *     "令和7年1月24日"   → new Date("2025-01-24")
 *     "令和元年5月1日"   → new Date("2019-05-01")
 */
export function parseJapaneseDate(text: string): Date | null {
  // 全角数字を半角に変換
  const normalized = text.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
  );

  // 「元年」→「1年」に変換
  const withYear = normalized.replace(/元年/, "1年");

  // パターン: (令和|平成|昭和)(数字)年(数字)月(数字)日
  const match = withYear.match(/(令和|平成|昭和)\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
  if (!match) return null;

  const era = match[1];
  const eraYear = parseInt(match[2], 10);
  const month = parseInt(match[3], 10);
  const day = parseInt(match[4], 10);

  const base = ERA_BASE[era];
  if (!base) return null;

  const westernYear = base + eraYear;

  // 簡易バリデーション
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (westernYear < 1926 || westernYear > 2100) return null;

  return new Date(`${westernYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}
