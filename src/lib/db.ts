import path from "node:path";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * better-sqlite3는 `file:./dev.db` 같은 상대 경로를 **프로세스 CWD** 기준으로 엽니다.
 * Next.js/Turbo가 예상과 다른 CWD에서 뜨면 잘못된 DB를 열거나 실패할 수 있어, 항상 절대 경로로 고정합니다.
 */
export function resolveSqliteDatabaseUrl(raw?: string): string {
  const fallback = "file:./dev.db";
  const source = (raw ?? fallback).trim();
  if (source === ":memory:") {
    return ":memory:";
  }
  const stripped = source.startsWith("file:") ? source.slice("file:".length) : source;
  if (stripped === ":memory:" || stripped.startsWith(":memory:")) {
    return ":memory:";
  }
  if (path.isAbsolute(stripped)) {
    return `file:${stripped}`;
  }
  const abs = path.resolve(/* turbopackIgnore: true */ process.cwd(), stripped.replace(/^\.\//, ""));
  return `file:${abs}`;
}

export function createPrismaClient() {
  const databaseUrl = resolveSqliteDatabaseUrl(process.env.DATABASE_URL);
  const adapter = new PrismaBetterSqlite3({
    url: databaseUrl
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });
}

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
