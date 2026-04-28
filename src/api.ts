// ============================================
// REST API — Endpoints for Our Finance Space Dashboard
//
// Serves data from PostgreSQL to the React dashboard.
// Uses built-in Node.js http module (no Express needed).
// ============================================

import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from './db';

// === PERSON MAPPING ===
// Map WhatsApp phone numbers & Telegram IDs to person names
const PERSON_MAP: Record<string, string> = {
  '6282246167772@s.whatsapp.net': 'Catur',
  '082246167772@s.whatsapp.net': 'Catur',
  '6281536021027@s.whatsapp.net': 'Vermita',
  '081536021027@s.whatsapp.net': 'Vermita',
  // Add Telegram IDs here if needed
};

function getPersonName(userId: string): string {
  return PERSON_MAP[userId] || 'Catur';
}

// === CATEGORY CONFIG ===
const CATEGORY_CONFIG: Record<string, { color: string; icon: string }> = {
  'Makanan & Minuman': { color: '#10b981', icon: '🍜' },
  'Food':              { color: '#10b981', icon: '🍜' },
  'Entertaint':        { color: '#f08672', icon: '🎬' },
  'Fun':               { color: '#f08672', icon: '🎬' },
  'Sedekah':           { color: '#a78bfa', icon: '🤲' },
  'Listrik':           { color: '#f59e0b', icon: '⚡' },
  'Bills':             { color: '#f37432', icon: '🧾' },
  'Laundry':           { color: '#6ee7b7', icon: '👕' },
  'Kontrakan':         { color: '#f97316', icon: '🏠' },
  'Cicilan':           { color: '#ef4444', icon: '💳' },
  'Orang Tua':         { color: '#ec4899', icon: '👨‍👩‍👧' },
  'Transportasi':      { color: '#34d399', icon: '🚗' },
  'Transport':         { color: '#34d399', icon: '🚗' },
  'Uang Harian':       { color: '#8b5cf6', icon: '💵' },
  'Shopping':          { color: '#fcb98a', icon: '🛍️' },
  'Health':            { color: '#14b8a6', icon: '💊' },
  'Education':         { color: '#f59e0b', icon: '📚' },
  'Gift':              { color: '#f472b6', icon: '🎁' },
  'Lainnya':           { color: '#94a3b8', icon: '📦' },
};

const CATEGORY_GRADIENT: Record<string, string> = {
  'Makanan & Minuman': 'from-finance-300 to-finance-500',
  'Food':              'from-finance-300 to-finance-500',
  'Entertaint':        'from-blush-300 to-blush-500',
  'Fun':               'from-blush-300 to-blush-500',
  'Sedekah':           'from-finance-200 to-finance-400',
  'Listrik':           'from-peach-300 to-peach-500',
  'Bills':             'from-peach-400 to-blush-500',
  'Laundry':           'from-finance-100 to-finance-300',
  'Kontrakan':         'from-peach-400 to-peach-600',
  'Cicilan':           'from-blush-400 to-blush-600',
  'Orang Tua':         'from-blush-300 to-peach-400',
  'Transportasi':      'from-finance-200 to-finance-400',
  'Transport':         'from-finance-200 to-finance-400',
  'Uang Harian':       'from-finance-400 to-finance-600',
  'Shopping':          'from-peach-300 to-peach-500',
  'Health':            'from-finance-400 to-finance-600',
  'Education':         'from-peach-200 to-peach-400',
  'Gift':              'from-blush-200 to-peach-300',
  'Lainnya':           'from-finance-200 to-finance-400',
};

// === HELPERS ===

function parseCategory(description: string): string {
  // Format: "Kategori (MetodeBayar)|Deskripsi" or "Kategori|Deskripsi"
  const pipeParts = description.split('|');
  const mainPart = pipeParts[0].trim();
  // Remove payment method in parentheses
  const category = mainPart.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return category || 'Lainnya';
}

function parseDescription(description: string): string {
  const pipeParts = description.split('|');
  if (pipeParts[1] && pipeParts[1].trim()) {
    return pipeParts[1].trim();
  }
  // If no pipe description, use the main part
  return pipeParts[0].replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// === CORS ===
function setCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// === AUTH ===
function isAuthorized(req: IncomingMessage): boolean {
  const token = process.env.API_TOKEN;
  if (!token) return true; // No token configured = open access

  const authHeader = req.headers.authorization;
  if (!authHeader) return false;

  const [scheme, value] = authHeader.split(' ');
  return scheme === 'Bearer' && value === token;
}

// === JSON RESPONSE ===
function sendJson(res: ServerResponse, data: any, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, status = 500) {
  sendJson(res, { error: message }, status);
}

// === ROUTE HANDLERS ===

async function handleSummary(res: ServerResponse) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Monthly transactions
  const monthlyTx = await prisma.transaction.findMany({
    where: { timestamp: { gte: startOfMonth } },
  });

  const monthlyIncome = monthlyTx
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const monthlyExpense = monthlyTx
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const transactionCount = monthlyTx.length;

  // All-time balance
  const allTx = await prisma.transaction.findMany();
  const totalIncome = allTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = allTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const totalBalance = totalIncome - totalExpense;

  // Saving progress
  const monthlySavingTarget = 8_000_000;
  const monthlySavingActual = monthlyIncome - monthlyExpense;
  const savingProgress = monthlySavingTarget > 0
    ? Math.min(1, Math.max(0, monthlySavingActual / monthlySavingTarget))
    : 0;

  sendJson(res, {
    totalBalance,
    monthlyIncome,
    monthlyExpense,
    transactionCount,
    savingProgress: Math.round(savingProgress * 100) / 100,
    monthlySavingTarget,
    monthlySavingActual: Math.max(0, monthlySavingActual),
  });
}

import { getGoalsFromSheet } from './sheets';

async function handleGoals(res: ServerResponse) {
  // Coba ambil dari Google Sheets terlebih dahulu
  const sheetGoals = await getGoalsFromSheet();
  
  if (sheetGoals && sheetGoals.length > 0) {
    sendJson(res, sheetGoals);
    return;
  }

  // Fallback ke database jika tab Goals tidak ada atau error
  const goals = await prisma.savingGoal.findMany();
  sendJson(res, goals);
}

async function handleExpenseCategories(res: ServerResponse) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const monthlyExpenses = await prisma.transaction.findMany({
    where: { type: 'expense', timestamp: { gte: startOfMonth } },
  });

  // Group by category
  const categoryMap: Record<string, { count: number; total: number }> = {};
  for (const tx of monthlyExpenses) {
    const cat = parseCategory(tx.description);
    if (!categoryMap[cat]) categoryMap[cat] = { count: 0, total: 0 };
    categoryMap[cat].count++;
    categoryMap[cat].total += tx.amount;
  }

  const categories = Object.entries(categoryMap).map(([name, data]) => {
    const config = CATEGORY_CONFIG[name] || CATEGORY_CONFIG['Lainnya'];
    const gradient = CATEGORY_GRADIENT[name] || CATEGORY_GRADIENT['Lainnya'];
    return {
      name,
      icon: config.icon,
      color: gradient,
      count: data.count,
      total: Math.round(data.total),
    };
  });

  // Sort by total descending
  categories.sort((a, b) => b.total - a.total);
  sendJson(res, categories);
}

async function handleExpenseByCategory(res: ServerResponse) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const monthlyExpenses = await prisma.transaction.findMany({
    where: { type: 'expense', timestamp: { gte: startOfMonth } },
  });

  const categoryMap: Record<string, number> = {};
  for (const tx of monthlyExpenses) {
    const cat = parseCategory(tx.description);
    categoryMap[cat] = (categoryMap[cat] || 0) + tx.amount;
  }

  const chartData = Object.entries(categoryMap).map(([name, value]) => {
    const config = CATEGORY_CONFIG[name] || CATEGORY_CONFIG['Lainnya'];
    return {
      name,
      value: Math.round(value),
      color: config.color,
      icon: config.icon,
    };
  });

  chartData.sort((a, b) => b.value - a.value);
  sendJson(res, chartData);
}

async function handleMonthlyCashflow(res: ServerResponse) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const currentYear = now.getFullYear();

  // Get all transactions for the current year
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);

  const yearTx = await prisma.transaction.findMany({
    where: {
      timestamp: { gte: yearStart, lte: yearEnd },
    },
  });

  const cashflow = months.map((month, idx) => {
    const monthTx = yearTx.filter(t => {
      const txMonth = new Date(t.timestamp).getMonth();
      return txMonth === idx;
    });

    const income = monthTx
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const expense = monthTx
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    return { month, income: Math.round(income), expense: Math.round(expense) };
  });

  sendJson(res, cashflow);
}

async function handleTransactions(res: ServerResponse) {
  const transactions = await prisma.transaction.findMany({
    orderBy: { timestamp: 'desc' },
    take: 50,
  });

  const formatted = transactions.map(tx => ({
    id: tx.id,
    date: tx.timestamp.toISOString().split('T')[0],
    person: getPersonName(tx.userId),
    category: parseCategory(tx.description),
    description: parseDescription(tx.description),
    amount: tx.amount,
    type: tx.type,
  }));

  sendJson(res, formatted);
}

async function handleNotes(res: ServerResponse) {
  const notes = await prisma.note.findMany({
    orderBy: { createdAt: 'desc' },
  });
  sendJson(res, notes);
}

async function handleCouple(res: ServerResponse) {
  sendJson(res, {
    partner1: { name: 'Catur', emoji: '👨🏻', color: '#10b981' },
    partner2: { name: 'Vermita', emoji: '👩🏻', color: '#f37432' },
    startedTracking: '2024-08-12',
  });
}

// === MAIN API HANDLER ===

export async function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url || '';

  // Only handle /api/* routes
  if (!url.startsWith('/api')) return false;

  // CORS preflight
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Auth check
  if (!isAuthorized(req)) {
    sendError(res, 'Unauthorized', 401);
    return true;
  }

  // Only GET is supported
  if (req.method !== 'GET') {
    sendError(res, 'Method not allowed', 405);
    return true;
  }

  try {
    const path = url.split('?')[0]; // Strip query params

    switch (path) {
      case '/api/summary':
        await handleSummary(res);
        break;
      case '/api/goals':
        await handleGoals(res);
        break;
      case '/api/expense-categories':
        await handleExpenseCategories(res);
        break;
      case '/api/expense-by-category':
        await handleExpenseByCategory(res);
        break;
      case '/api/monthly-cashflow':
        await handleMonthlyCashflow(res);
        break;
      case '/api/transactions':
        await handleTransactions(res);
        break;
      case '/api/notes':
        await handleNotes(res);
        break;
      case '/api/couple':
        await handleCouple(res);
        break;
      default:
        sendError(res, 'Not found', 404);
    }
  } catch (err: any) {
    console.error('[API Error]', err);
    sendError(res, err.message || 'Internal server error', 500);
  }

  return true;
}
