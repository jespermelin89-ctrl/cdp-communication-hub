import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
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
