// src/lib/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// DATABASE_URL に connection_limit と pool_timeout を確実に付与する。
// URL クラスで parse するため、既存パラメータ（pgbouncer=true 等）は保持される。
// すでに connection_limit / pool_timeout がある場合は上書きする。
function ensurePoolParams(raw: string | undefined): string {
  if (!raw) return "";
  const url = new URL(raw);
  url.searchParams.set("connection_limit", "1");
  url.searchParams.set("pool_timeout", "20");
  return url.toString();
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development"
      ? ["query", "warn", "error"]
      : ["warn", "error"],
    datasources: {
      db: {
        url: ensurePoolParams(process.env.DATABASE_URL),
      },
    },
  });

globalForPrisma.prisma = prisma;
