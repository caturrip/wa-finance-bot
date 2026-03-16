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
    // Baca kolom H dari baris 1-200 untuk cari data dan baris kosong
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Mar!H1:H200'
    });
    
    const rows = res.data.values || [];
    console.log(`Total baris terisi di kolom H: ${rows.length}`);
    
    // Tampilkan baris 80-92
    console.log('\nBaris 80-92 di kolom H:');
    for (let i = 79; i < Math.min(92, rows.length); i++) {
      console.log(`Baris ${i+1}: "${rows[i]?.[0] || '(kosong)'}"`);
    }
    
    // Cari baris kosong pertama
    let firstEmpty = rows.length + 1;
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i] || !rows[i][0] || rows[i][0].trim() === '') {
        firstEmpty = i + 1;
        break;
      }
    }
    console.log(`\nBaris kosong pertama di kolom H: baris ${firstEmpty}`);
    
    // Cek apa yang ada di H80:K95
    const res2 = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      range: 'Mar!H85:K95'
    });
    console.log('\nData H85:K95:');
    console.table(res2.data.values);
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}
run();
