import dotenv from 'dotenv';
dotenv.config({ override: true });

import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { getAuthToken } from './sheets';

const prisma = new PrismaClient();

const monthNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
];

// Helper untuk parsing tanggal format "Monday, March 16, 2026" atau format lokal
function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d;
}

async function importFromGoogleSheets() {
  const spreadSheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadSheetId) {
    console.error('ERROR: GOOGLE_SPREADSHEET_ID is not set in .env');
    return;
  }

  const auth = await getAuthToken();
  if (!auth) {
    console.error('ERROR: Failed to authenticate with Google Sheets. Check Service Account keys.');
    return;
  }

  const sheets = google.sheets({ version: 'v4', auth });
  let totalImported = 0;
  let totalSkipped = 0;

  console.log('Starting Google Sheets Import to PostgreSQL...');

  // Catur's default phone number for imported transactions
  const defaultUserId = '082246167772@s.whatsapp.net';

  for (const monthName of monthNames) {
    console.log(`\n--- Memproses bulan ${monthName} ---`);
    
    try {
      // 1. IMPORT EXPENSE (H14:L1000)
      // H: Tanggal, I: Metode Bayar, J: Kategori, K: Deskripsi, L: Amount
      const expenseRes = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadSheetId,
        range: `${monthName}!H14:L1000`,
      });
      
      const expenseRows = expenseRes.data.values || [];
      
      for (const row of expenseRows) {
        if (!row[0] || !row[4]) continue; // Skip jika tanggal atau amount kosong

        const dateStr = row[0].toString().trim();
        const metodeBayar = (row[1] || '').toString().trim();
        const kategori = (row[2] || 'Lainnya').toString().trim();
        const deskripsi = (row[3] || '').toString().trim();
        const amountStr = row[4].toString().replace(/[^0-9.-]+/g, '');
        const amount = parseFloat(amountStr);

        if (isNaN(amount) || amount === 0) continue;

        const timestamp = parseDateString(dateStr) || new Date();
        const finalDescription = metodeBayar !== '-' && metodeBayar !== '' 
          ? `${kategori} (${metodeBayar})|${deskripsi === '-' ? '' : deskripsi}`
          : `${kategori}|${deskripsi === '-' ? '' : deskripsi}`;

        // Cek duplikat di database
        const existing = await prisma.transaction.findFirst({
          where: {
            type: 'expense',
            amount: amount,
            description: finalDescription,
            // Compare the date portion only (ignore exact time) to avoid time-zone mismatch
            timestamp: {
              gte: new Date(timestamp.setHours(0,0,0,0)),
              lt: new Date(timestamp.setHours(23,59,59,999)),
            }
          }
        });

        if (!existing) {
          await prisma.transaction.create({
            data: {
              userId: defaultUserId,
              platform: 'whatsapp',
              type: 'expense',
              amount: amount,
              description: finalDescription,
              timestamp: timestamp
            }
          });
          totalImported++;
          console.log(`✅ Imported Expense: ${finalDescription} (Rp${amount})`);
        } else {
          totalSkipped++;
        }
      }

      // 2. IMPORT INCOME (A2:E50)
      // A: Tanggal, B: Kategori, C: Metode Bayar, D: (Ignored), E: Amount
      const incomeRes = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadSheetId,
        range: `${monthName}!A2:E50`,
      });

      const incomeRows = incomeRes.data.values || [];

      for (const row of incomeRows) {
        if (!row[0] || !row[4]) continue; // Skip jika tanggal atau amount kosong

        const dateStr = row[0].toString().trim();
        const kategori = (row[1] || 'Lainnya').toString().trim();
        const metodeBayar = (row[2] || '').toString().trim();
        const amountStr = row[4].toString().replace(/[^0-9.-]+/g, '');
        const amount = parseFloat(amountStr);

        if (isNaN(amount) || amount === 0) continue;

        const timestamp = parseDateString(dateStr) || new Date();
        const finalDescription = metodeBayar !== '-' && metodeBayar !== '' 
          ? `${kategori} (${metodeBayar})|`
          : `${kategori}|`;

        const existing = await prisma.transaction.findFirst({
          where: {
            type: 'income',
            amount: amount,
            description: finalDescription,
            timestamp: {
              gte: new Date(timestamp.setHours(0,0,0,0)),
              lt: new Date(timestamp.setHours(23,59,59,999)),
            }
          }
        });

        if (!existing) {
          await prisma.transaction.create({
            data: {
              userId: defaultUserId,
              platform: 'whatsapp',
              type: 'income',
              amount: amount,
              description: finalDescription,
              timestamp: timestamp
            }
          });
          totalImported++;
          console.log(`✅ Imported Income: ${finalDescription} (Rp${amount})`);
        } else {
          totalSkipped++;
        }
      }

    } catch (err: any) {
      console.warn(`⚠️ Gagal memproses sheet ${monthName} (Mungkin tab belum ada): ${err.message}`);
    }
  }

  console.log(`\n🎉 SELESAI!`);
  console.log(`Total data diimport: ${totalImported}`);
  console.log(`Total data di-skip (sudah ada): ${totalSkipped}`);

  await prisma.$disconnect();
}

importFromGoogleSheets().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
