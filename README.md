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
│   │   ├── page.tsx                    # / (今日の3分まとめ)
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
