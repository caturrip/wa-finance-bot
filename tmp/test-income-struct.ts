import { google } from 'googleapis';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  
  const sheets = google.sheets({ version: 'v4', auth });
  
  try {
    // Cari struktur tabel pemasukan di kolom A:F baris 1-30
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Mar!A1:F30',
      valueRenderOption: 'FORMATTED_VALUE',
    });
    console.log('Struktur A1:F30:');
    (res.data.values || []).forEach((row, i) => {
      if (row.some(c => c !== '')) {
        console.log(`Baris ${i+1}: [${row.map(c => `"${c}"`).join(', ')}]`);
      }
    });
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}
run();
