import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaPool: Pool | undefined;
};

function normalizeDatabaseUrl(raw: string | undefined): string {
  const fallback = "postgresql://127.0.0.1:1/invalid"
  if (!raw?.trim()) return fallback
  try {
    const u = new URL(raw)
    // Empty path → Postgres defaults DB name to the role (e.g. "felixkrusch").
    // Force an explicit database name for this app.
    if (!u.pathname || u.pathname === "/") {
      u.pathname = "/invoices"
    }
    return u.toString()
  } catch {
    return raw
  }
}

function createPrisma() {
  const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL)
  if (process.env.NODE_ENV !== "production") {
    try {
      const u = new URL(connectionString)
      const db = u.pathname.replace(/^\//, "").split("?")[0] || "(none)"
      // eslint-disable-next-line no-console
      console.info(`[prisma] connecting as ${u.username || "(peer)"}@${u.hostname}:${u.port || 5432}/${db}`)
    } catch {
      // ignore
    }
  }
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  globalForPrisma.prismaPool = pool
  const adapter = new PrismaPg(pool)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrisma()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
