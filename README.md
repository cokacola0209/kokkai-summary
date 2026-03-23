# 🏛 国会ラボ

NDL 国会会議録検索システム API を使い、毎日の国会審議を AI が構造化要約して公開する Next.js アプリ。

## アーキテクチャ

```
NDL API → fetch-meetings.ts (バッチ) → PostgreSQL (Prisma)
                                            ↓
                                    summarizer (LLM map-reduce)
                                            ↓
                                    Next.js App Router (UI)
```

## セットアップ

### 1. 依存インストール

```bash
npm install
```

### 2. 環境変数

```bash
cp .env.example .env
# .env を編集して DATABASE_URL・LLM_PROVIDER・API キーを設定
```

### 3. DB 初期化

```bash
npx prisma migrate dev --name init
# または開発初期は:
npx prisma db push
```

### 4. 開発サーバー

```bash
npm run dev
```

### 5. バッチ実行 (前日分取得)

```bash
npm run job:fetch
# 日付指定:
npx tsx src/jobs/fetch-meetings.ts 2024-05-01
```

## LLM プロバイダ切り替え

`.env` の `LLM_PROVIDER` を変更するだけで切り替え可能:

| 値 | 説明 |
|---|---|
| `openai` | OpenAI Chat Completions (デフォルト) |
| `anthropic` | Anthropic Messages API |
| `stub` | テスト用スタブ (API 呼び出しなし) |

## Vercel デプロイ

```bash
vercel --prod
```

`vercel.json` に cron 設定済み (毎日 20:00 UTC = 翌朝 5:00 JST)。

Vercel 環境変数に `CRON_SECRET`・`DATABASE_URL`・`LLM_PROVIDER`・API キーを設定すること。

## コミット構成

| # | 内容 |
|---|---|
| 1 | Prisma schema (Meeting / Speech / Summary / FetchLog) |
| 2 | NDL API クライアント (fetch + リトライ + ページネーション) |
| 3 | Prisma singleton + 取込ジョブ (`fetch-meetings.ts`) |
| 4 | 要約生成モジュール (map-reduce + LLM 抽象化) |
| 5 | Next.js ページ実装 (/ /meetings /meetings/[id] /topics/[tag]) |
| 6 | 設定ファイル群 + Vercel cron API |

## データ出典

[国立国会図書館 国会会議録検索システム](https://kokkai.ndl.go.jp/)

本サイトはAIによる自動要約サイトです。より正確な国会の内容を確認したい場合は、一次情報（国立国会図書館）をご確認ください。

## ディレクトリ構成

```
.
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # / (直近の3分まとめ)
│   │   ├── meetings/
│   │   │   ├── page.tsx                # /meetings (一覧)
│   │   │   └── [id]/page.tsx           # /meetings/[id] (詳細)
│   │   ├── topics/
│   │   │   └── [tag]/page.tsx          # /topics/[tag] (タグ絞り込み)
│   │   └── api/
│   │       ├── cron/fetch/route.ts     # Vercel Cron エンドポイント
│   │       └── regenerate/[id]/route.ts
│   ├── components/
│   │   ├── NavBar.tsx
│   │   └── ui.tsx
│   ├── jobs/
│   │   └── fetch-meetings.ts           # ローカル実行バッチ
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── ndl/client.ts
│   │   └── summarizer/
│   │       ├── index.ts               # map-reduce ロジック
│   │       └── llm.ts                 # LLM プロバイダ抽象層
│   └── types/
│       └── ndl.ts
├── .env.example
├── vercel.json
└── package.json
```
# 国会ラボ — 自動取得バッチ

## 概要

国会会議録検索システムAPIから毎日自動で新着会議録を取得し、
DB保存・要約生成・管理者まとめ下書き生成までを行います。

## データ取得元

- **国立国会図書館 国会会議録検索システム**
- API: https://kokkai.ndl.go.jp/api.html

## ⚠️ API利用時の注意

- 高頻度アクセスを避けてください（1日1回推奨）
- **継続的な営利利用前に、利用条件の確認と必要な申請を行ってください**
- API利用規約: https://kokkai.ndl.go.jp/
- 取得データの著作権は国会会議録に準じます
- 自動要約はAI下書きであり、公開前に人による確認を推奨します

## 自動取得の仕組み

### 処理フロー

1. NDL APIから前日の会議録を取得
2. Meeting / Speech をDB保存（upsert）
3. Anthropic APIで要約を生成
4. 管理者まとめ（AI下書き）を生成
5. FetchLogに実行ログを記録

### 冪等性

- issueId（NDL会議ID）のユニーク制約で重複登録を防止
- 要約は既存がなければ生成（既存はスキップ）
- 管理者まとめはupsert（同日分は上書き）
- 再実行しても安全

## 実行方法

### 手動実行（ローカル）

```bash
# 前日分を取得
npx tsx src/jobs/fetch-meetings.ts

# 特定日を取得
npx tsx src/jobs/backfill.ts --from 2025-06-05 --to 2025-06-05

# 管理者まとめを生成
npx tsx src/jobs/generate-editor-note.ts --date 2025-06-05
```

### 手動実行（API経由）

```
GET /api/cron/fetch?token=YOUR_CRON_SECRET
GET /api/cron/fetch?token=YOUR_CRON_SECRET&date=2025-06-05
```

### Vercel Cron（自動実行）

`vercel.json` に以下を設定済み:

```json
{
  "crons": [{ "path": "/api/cron/fetch", "schedule": "0 20 * * *" }]
}
```

毎日 UTC 20:00（日本時間 翌5:00）に自動実行されます。

### 環境変数

| 変数名 | 用途 | 必須 |
|---|---|---|
| DATABASE_URL | Supabase接続（pooler） | ✅ |
| DIRECT_URL | Supabase接続（direct） | ✅ |
| ANTHROPIC_API_KEY | 要約生成用 | ✅ |
| ANTHROPIC_MODEL | 使用モデル | 任意 |
| CRON_SECRET | Cron認証用 | 推奨 |

## 障害時の確認方法

1. Vercel Logs でエラーを確認
2. DB の `FetchLog` テーブルで取得状況を確認
3. 特定日の再取得: `npx tsx src/jobs/backfill.ts --from YYYY-MM-DD --to YYYY-MM-DD`
4. 要約失敗分の再生成: 同じbackfillコマンドで再実行（既存Meetingはスキップ、要約なしのみ生成）

## 今すぐ実装できること / 本番収益化前に確認すべきこと

### 今すぐ可能
- 日次自動取得
- 要約生成
- 管理者まとめ下書き生成
- サイト表示

### 収益化前に確認が必要
- NDL API利用規約の再確認（営利利用時の申請有無）
- 会議録データの二次利用条件
- AI要約の免責表示
- 広告掲載時のデータ利用条件との整合性
