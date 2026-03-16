const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const tables = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
    console.log('tables:', tables);
  } catch (e) {
    console.error('error querying tables:', e);
  } finally {
    await prisma.$disconnect();
  }
})();
