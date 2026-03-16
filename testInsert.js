const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.transaction.create({
      data: {
        userId: 'test',
        platform: 'whatsapp',
        type: 'income',
        amount: 1.23,
        description: 'test',
      },
    });
    console.log('inserted', result);
  } catch (e) {
    console.error('insert error', e);
  } finally {
    await prisma.$disconnect();
  }
})();
