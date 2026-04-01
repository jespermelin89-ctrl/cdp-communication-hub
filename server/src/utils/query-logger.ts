import { prisma } from '../config/database';

// In dev, log queries that take > 100ms
if (process.env.NODE_ENV !== 'production') {
  prisma.$on('query' as never, (e: any) => {
    if (e.duration > 100) {
      console.warn(`Slow query (${e.duration}ms): ${e.query}`);
    }
  });
}
