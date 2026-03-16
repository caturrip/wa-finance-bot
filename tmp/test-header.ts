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
    // Cek baris 5-12 untuk melihat struktur header di kolom G:L
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Mar!G5:L12',
      valueRenderOption: 'FORMATTED_VALUE',
    });
    console.log('Baris 5-12 di kolom G:L:');
    (res.data.values || []).forEach((row, i) => {
      console.log(`Baris ${5+i}: [${row.map(c => `"${c}"`).join(', ')}]`);
    });
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}
run();
