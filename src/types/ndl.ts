// src/types/ndl.ts

/** NDL 国会会議録検索システム API レスポンス型 */

export interface NdlMeetingResponse {
  numberOfRecords: number;
  numberOfReturn: number;
  startRecord: number;
  nextRecordPosition: number | null;
  meetingRecord: NdlMeetingRecord[];
}

export interface NdlMeetingRecord {
  issueID: string;
  imageKind: string;
  searchObject: number;
  session: number;
  nameOfHouse: string;
  nameOfMeeting: string;
  issue: string;
  date: string; // "YYYY-MM-DD"
  closing: string | null;
  speechRecord: NdlSpeechRecord[];
  meetingURL: string;
  pdfURL: string | null;
}

export interface NdlSpeechRecord {
  speechID: string;
  speechOrder: number;
  speaker: string;
  speakerYomi: string | null;
  speakerGroup: string | null;
  speakerPosition: string | null;
  speakerRole: string | null;
  speech: string;
  startPage: number;
  createTime: string;
  updateTime: string;
  speechURL: string;
}

/** fetch ジョブ用パラメータ */
export interface FetchMeetingsParams {
  /** 取得対象日 (YYYY-MM-DD) */
  date: string;
  /** 院名フィルタ (省略で全院) */
  nameOfHouse?: string;
  /** 1リクエストあたり最大件数 (NDL上限: 100) */
  maximumRecords?: number;
}
