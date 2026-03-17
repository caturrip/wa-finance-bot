// Quotes harian random
export function getRandomQuote(): string {
  const quotes = [
    '_Setiap pengeluaran hari ini, semoga jadi kenangan indah bersama kamu._',
    '_Menabung untuk masa depan, tapi bahagia bersamamu hari ini._',
    '_Makan sederhana, asal berdua terasa istimewa._',
    '_Bersama kamu, setiap hari jadi lebih bermakna._',
    '_Cinta itu sederhana: cukup saling percaya dan saling jajan bareng._',
    '_Uang bisa dicari, tapi waktu bersamamu tak ternilai harganya._',
    '_Semoga rejeki kita selalu cukup untuk saling membahagiakan._',
    '_Terima kasih sudah jadi partner hidup dan partner keuangan._',
    '_Setiap transaksi hari ini, semoga membawa berkah untuk keluarga kecil kita._',
    '_Bersamamu, belanja bulanan pun jadi quality time._'
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}
// Utility functions used by both WhatsApp and Telegram bots.

export type BotPlatform = 'whatsapp' | 'telegram';

export type InferredTransaction = {
  type: 'income' | 'expense';
  amount: number;
  source: string;
  description: string;
  timestamp?: Date;
};

/**
 * Parse Indonesian-style currency text into a number.
 * Supports: 50.000, 50.000,00, 50rb, 2juta, 2jt, Rp 50.000, dll.
 */
export function parseAmount(raw: string): number {
  if (!raw) return NaN;
  let s = raw.trim().toLowerCase();

  // Remove common prefixes/symbols
  s = s.replace(/^rp\s*/i, '');
  s = s.replace(/[^0-9.,\-a-z]/g, '');

  // Handle suffixes (rb/ribu/jt/juta)
  const suffixMatch = s.match(/([0-9.,\-]+)\s*(juta|jt|j|rb|ribu)$/);
  if (suffixMatch) {
    const numPart = suffixMatch[1];
    const suffix = suffixMatch[2];
    const base = parseAmount(numPart); // recursive but base case stripped
    if (isNaN(base)) return NaN;
    if (suffix.startsWith('j')) return base * 1_000_000;
    if (suffix.startsWith('r')) return base * 1_000;
  }

  // Handle multi-part (e.g. 1.234.567,89)
  if (s.includes(',') && s.includes('.')) {
    // treat '.' as thousand separator, ',' as decimal
    s = s.replace(/\./g, '').replace(/,/g, '.');
  } else if (s.includes('.') && !s.includes(',')) {
    // If dot appears and last group is 3 digits, treat as thousand separators
    const parts = s.split('.');
    const last = parts[parts.length - 1];
    if (last.length === 3) {
      s = parts.join('');
    }
  } else if (s.includes(',') && !s.includes('.')) {
    // Comma as decimal separator
    s = s.replace(/,/g, '.');
  }

  const num = parseFloat(s);
  return isNaN(num) ? NaN : num;
}

const expenseCategoryKeywords: Array<{ category: string; keywords: RegExp[] }> = [
    {
      category: 'Lainnya',
      keywords: [
        /\btransfer\b/, /\btukar\b/, /\buang\b/, /\bmutasi\b/, /\bkue\b/, /\bghista\b/, /\banna\b/
      ],
    },
  {
    category: 'Makanan & Minuman',
    keywords: [
      /\bmakan\b/, /\bminum\b/, /\bkopi\b/, /\bteh\b/, /\bresto\b/, /\bwarteg\b/, /\bfood\b/, /\bbeli\b/, /\bsnack\b/, /\bcemilan\b/, /\bjemput\b/, /\bbakso\b/, /\bmie\b/, /\bnasi\b/, /\btahu\b/, /\btempe\b/, /\bayam\b/, /\bsate\b/, /\bburger\b/, /\bpizza\b/,
    ],
  },
  { category: 'Entertaint', keywords: [/\bnonton\b/, /\bbioskop\b/, /\bnetflix\b/, /\bspotify\b/, /\bhbo\b/, /\bgame\b/, /\bhidup\s*\bhibur\b/] },
  { category: 'Sedekah', keywords: [/\bsedekah\b/, /\binfaq\b/, /\bzakat\b/, /\bngasih\b/, /\bkasih\b/, /\bkak\b/, /\bvinny\b/, /\bshiva\b/] },
  { category: 'Listrik', keywords: [/\blistrik\b/, /\bpln\b/, /\btoken\b/] },
  { category: 'Laundry', keywords: [/\blaundry\b/] },
  { category: 'Kontrakan', keywords: [/\bkontrakan\b/, /\bsewa\b/, /\bkost\b/, /\bbayar\b.*\bkontrakan\b/] },
  { category: 'Cicilan', keywords: [/\bcicilan\b/, /\bangsuran\b/] },
  { category: 'Orang Tua', keywords: [/\borang\s*\btua\b/] },
  { category: 'Transportasi', keywords: [/\btransportasi\b/, /\bgojek\b/, /\bgrab\b/, /\btaksi\b/, /\bbensin\b/, /\bbb?m\b/, /\btol\b/] },
  { category: 'Uang Harian', keywords: [/\buang\s*harian\b/, /\bdaily\b/] },
];

const incomeCategoryKeywords: Array<{ category: string; keywords: RegExp[] }> = [
  { category: 'Gaji Catur', keywords: [/\bgaji\b/, /\bcatur\b/] },
  { category: 'Gaji Vermita', keywords: [/\bgaji\b/, /\bvermita\b/] },
  { category: 'Panvers Store', keywords: [/\bpanvers\b/, /\bstore\b/] },
  { category: 'THR Catur', keywords: [/\bthr\b/, /\bgaji\b/, /\bcatur\b/] },
  { category: 'THR Vermita', keywords: [/\bthr\b/, /\bgaji\b/, /\bvermita\b/] },
];

export function inferExpenseCategory(text: string): string {
  const lower = text.toLowerCase();

  for (const item of expenseCategoryKeywords) {
    if (item.keywords.some((rx) => rx.test(lower))) {
      return item.category;
    }
  }

  // Jika ada kata "beli" dan tidak ditemui kategori lain, asumsikan Makanan & Minuman
  if (/\bbeli\b/.test(lower)) {
    return 'Makanan & Minuman';
  }

  // Jika formatnya cukup sederhana (kata + angka seperti "Bakso 10rb"), anggap ini Makanan & Minuman
  // (agar tidak memaksa pengguna harus menulis keyword spesifik seperti "makan"/"minum").
  if (/\b[a-zA-Z]+\b/.test(lower) && /\d/.test(lower)) {
    return 'Makanan & Minuman';
  }

  return 'Lainnya';
}

export function inferIncomeCategory(text: string): string {
  const lower = text.toLowerCase();

  for (const item of incomeCategoryKeywords) {
    if (item.keywords.some((rx) => rx.test(lower))) {
      return item.category;
    }
  }

  return 'Lainnya';
}

export function inferTransactionFromText(text: string): InferredTransaction | null {
  const normalized = text.trim();
  if (!normalized) return null;

  // Tidak perlu parsing tanggal, selalu pakai hari ini
  const tanggal = new Date();
  const tanggalStr = '';

  // Cari nominal di teks
  const tokens = normalized.split(/\s+/);
  let amount: number | null = null;
  let amountIndex = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const parsed = parseAmount(tokens[i]);
    if (!isNaN(parsed)) {
      amount = parsed;
      amountIndex = i;
      break;
    }
  }

  if (amount === null) return null;

  // Tentukan apakah ini income atau expense. Default = expense.
  const lower = normalized.toLowerCase();
  const isIncome = /\b(income|gaji|thr|bonus|pemasukan)\b/.test(lower);
  const type: 'income' | 'expense' = isIncome ? 'income' : 'expense';

  const source = type === 'income' ? inferIncomeCategory(lower) : inferExpenseCategory(lower);

  // Deskripsi: seluruh teks kecuali angka nominal
  let descTokens = tokens.filter((_, idx) => idx !== amountIndex);
  const desc = descTokens.join(' ');

  // Selalu pakai tanggal hari ini
  return {
    type,
    amount,
    source,
    description: desc,
    timestamp: tanggal
  };
}
