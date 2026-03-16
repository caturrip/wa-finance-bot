import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

import { exportToSheet } from './sheets';

export async function addTransaction(data: {
  userId: string;
  platform: 'whatsapp' | 'telegram';
  type: 'income' | 'expense';
  amount: number;
  description: string;
}) {
  const transaction = await prisma.transaction.create({
    data,
  });
  
  // Fitur Sync ke Google Sheets secara otomatis setiap kali ada transaksi baru
  try {
    await exportToSheet([transaction]);
  } catch (error) {
    console.error('Failed to auto-sync to Google Sheet:', error);
  }

  return transaction;
}

export async function getSummary(userId: string, type: 'daily' | 'monthly') {
  const now = new Date();
  let startDate = new Date();
  
  if (type === 'daily') {
    startDate.setHours(0, 0, 0, 0);
  } else {
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      timestamp: {
        gte: startDate,
        lte: now,
      },
    },
  });

  const income = transactions.filter((t: any) => t.type === 'income').reduce((sum: number, t: any) => sum + t.amount, 0);
  const expense = transactions.filter((t: any) => t.type === 'expense').reduce((sum: number, t: any) => sum + t.amount, 0);

  return { income, expense, balance: income - expense, transactions };
}

export async function getMonthlyTransactions(year: number, month: number) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  return await prisma.transaction.findMany({
    where: {
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: {
      timestamp: 'asc',
    },
  });
}
