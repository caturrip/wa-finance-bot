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
    // Read row headers (baris 6-7 sebagai header)
    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Mar!G6:L7'
    });
    console.log('=== HEADER baris 6-7 di kolom G:L ===');
    console.table(headerRes.data.values);

    // Read baris 80 sampai 95 untuk melihat data dan baris kosong pertama
    const dataRes = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Mar!G80:L95'
    });
    console.log('=== BARIS 80-95 di kolom G:L (mencari baris kosong pertama) ===');
    console.table(dataRes.data.values);

  } catch (err: any) {
    console.error('Error fetching data:', err.message);
  }
}
run();
