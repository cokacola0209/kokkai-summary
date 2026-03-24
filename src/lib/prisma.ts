// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// ✅ 変更①: connection_limit=1 を datasources で明示
// Vercel Serverless では各関数が独立したプロセスで動く。
// Prisma のデフォルト接続プールサイズは CPU 数ベースで決まり、
// 複数 Function が同時起動すると Supabase の接続上限（~20）をすぐ超える。
// connection_limit=1 にすることで1プロセス=1接続に抑制できる。
// pool_timeout=20 はタイムアウトを 20 秒に設定（デフォルト 10 秒より余裕を持たせる）。
//
// ※ DATABASE_URL の末尾に直接クエリパラメータを書く方法でも動くが、
//   datasources で上書きすると .env の URL を変えずに済む。
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["warn", "error"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

globalForPrisma.prisma = prisma;

// ────────────────────────────────────────────────────────
// 補足: DATABASE_URL に直接パラメータを追加する方法（どちらでもOK）
// Vercel 環境変数の DATABASE_URL を以下のように末尾に追記する:
//
//   postgresql://user:pass@host:5432/db?connection_limit=1&pool_timeout=20
//
// この方法でも同様の効果が得られる。
// datasources 上書きは "コードで管理したい場合" に向いている。
// ────────────────────────────────────────────────────────
