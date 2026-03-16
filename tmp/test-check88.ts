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
    // Cek isi di sekitar baris 88
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Mar!H86:K92'
    });
    console.log('Data di H86:K92 (sekitar baris kosong pertama):');
    if (!res.data.values || res.data.values.length === 0) {
      console.log('(kosong - tidak ada data)');
    } else {
      res.data.values.forEach((row, i) => console.log(`Baris ${86+i}:`, row));
    }
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}
run();
