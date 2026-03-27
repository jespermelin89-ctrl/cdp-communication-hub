import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Append connection_limit and pool_timeout to DATABASE_URL if not already set.
 * Supabase free tier (Session mode) has a low client cap — limit to 5 connections.
 * Set DIRECT_URL in Render env vars pointing to port 5432 for migrations.
 */
function buildDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return url;
  if (url.includes('connection_limit')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=5&pool_timeout=20`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: { url: buildDatabaseUrl() },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export async function connectDatabase(): Promise<boolean> {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
    return true;
  } catch (error) {
    console.error('⚠️ Database connection failed (server will continue without DB):', error);
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log('Database disconnected');
}
