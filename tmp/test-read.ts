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
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Mar!A1:E2000'
    });
    console.log(`Ada ${res.data.values?.length || 0} baris di sheet Mar.`);
    if (res.data.values && res.data.values.length > 0) {
      console.log('Baris pertama: ', res.data.values[0]);
      console.log('Baris terakhir: ', res.data.values[res.data.values.length - 1]);
    }
  } catch (err: any) {
    console.error('Error fetching data:', err.message);
  }
}
run();
