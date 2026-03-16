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
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID!;
  
  try {
    // Cek baris 11-18 untuk melihat di mana data pertama pengeluaran
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Mar!G11:L20',
      valueRenderOption: 'FORMATTED_VALUE',
    });
    console.log('Baris 11-20 di kolom G:L:');
    (res.data.values || []).forEach((row, i) => {
      console.log(`Baris ${11+i}: [${row.map(c => `"${c}"`).join(', ')}]`);
    });
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}
run();
