// ============================================
// SEED SCRIPT — Populate initial SavingGoals and Notes
// Run once: npx ts-node src/seed.ts
// ============================================

import dotenv from 'dotenv';
dotenv.config({ override: true });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding database...');

  // === SAVING GOALS ===
  const goalsCount = await prisma.savingGoal.count();
  if (goalsCount === 0) {
    await prisma.savingGoal.createMany({
      data: [
        {
          name: 'Dana Persalinan',
          icon: '🍼',
          target: 50_000_000,
          current: 36_500_000,
          deadline: 'Aug 2026',
          color: 'from-blush-300 to-peach-400',
          emoji: '💕',
        },
        {
          name: 'Dana Rumah',
          icon: '🏡',
          target: 350_000_000,
          current: 142_750_000,
          deadline: 'Dec 2028',
          color: 'from-finance-400 to-finance-600',
          emoji: '🌿',
        },
        {
          name: 'Dana Liburan',
          icon: '✈️',
          target: 25_000_000,
          current: 18_200_000,
          deadline: 'Jun 2026',
          color: 'from-peach-300 to-blush-400',
          emoji: '🌅',
        },
      ],
    });
    console.log('✅ Created 3 saving goals');
  } else {
    console.log(`⏭️  Skipped goals (${goalsCount} already exist)`);
  }

  // === NOTES ===
  const notesCount = await prisma.note.count();
  if (notesCount === 0) {
    await prisma.note.createMany({
      data: [
        {
          title: 'Budget Bulanan',
          body: 'Target maksimal pengeluaran 10jt/bulan. Sisihkan 8jt untuk tabungan + investasi reksadana.',
          color: 'bg-peach-100',
          darkColor: 'dark:bg-peach-200/20',
          accent: 'bg-peach-300',
          author: 'Catur',
        },
        {
          title: 'Reminder Tagihan',
          body: 'Listrik tgl 5, Internet tgl 10, BPJS tgl 15. Auto-debit aktif untuk semua. Cek saldo H-2.',
          color: 'bg-finance-100',
          darkColor: 'dark:bg-finance-300/15',
          accent: 'bg-finance-300',
          author: 'Vermita',
        },
        {
          title: 'Target Tabungan 2026',
          body: 'DP rumah 100jt — sudah 40%! Tetap konsisten 5jt/bulan, bonus tahunan langsung masuk savings 💪',
          color: 'bg-blush-100',
          darkColor: 'dark:bg-blush-200/15',
          accent: 'bg-blush-300',
          author: 'Catur & Vermita',
        },
        {
          title: 'Date Night Fund',
          body: 'Sisihkan 500k tiap bulan buat dinner berdua. Worth it untuk relationship investment 💕',
          color: 'bg-peach-100',
          darkColor: 'dark:bg-peach-200/20',
          accent: 'bg-peach-300',
          author: 'Vermita',
        },
        {
          title: 'Investasi Plan',
          body: 'Reksadana pasar uang 60% + saham blue-chip 30% + emas 10%. Review portfolio tiap 3 bulan.',
          color: 'bg-finance-100',
          darkColor: 'dark:bg-finance-300/15',
          accent: 'bg-finance-300',
          author: 'Catur',
        },
        {
          title: 'Emergency Fund',
          body: 'Target 6x pengeluaran bulanan = 60jt. Saat ini 35jt di tabungan terpisah. Aman 💚',
          color: 'bg-blush-100',
          darkColor: 'dark:bg-blush-200/15',
          accent: 'bg-blush-300',
          author: 'Catur & Vermita',
        },
      ],
    });
    console.log('✅ Created 6 notes');
  } else {
    console.log(`⏭️  Skipped notes (${notesCount} already exist)`);
  }

  console.log('Done seeding!');
  await prisma.$disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
