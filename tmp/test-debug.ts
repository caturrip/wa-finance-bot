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
    // Hitung baris kosong pertama (sama persis seperti di sheets.ts)
    const DATA_START_ROW = 8;
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `Mar!H${DATA_START_ROW}:H1000`,
    });
    
    const rows = readRes.data.values || [];
    console.log(`Rows ditemukan dari H${DATA_START_ROW}: ${rows.length}`);
    
    let firstEmptyRow = DATA_START_ROW + rows.length;
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i] || !rows[i][0] || rows[i][0].trim() === '') {
        firstEmptyRow = DATA_START_ROW + i;
        console.log(`Baris kosong ditemukan di index ${i}, = baris ${firstEmptyRow}`);
        break;
      }
    }
    
    console.log(`Target firstEmptyRow: ${firstEmptyRow}`);
    console.log(`Akan menulis ke: Mar!H${firstEmptyRow}:K${firstEmptyRow}`);
    
    // Tulis test data ke baris tersebut
    const testValues = [
      ['Sunday, March 16, 2026', 'JAGO', 'Uang Harian', 'Beli Gorengan Anjay FIXED']
    ];
    
    const updateRes = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Mar!H${firstEmptyRow}:K${firstEmptyRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: testValues },
    });
    
    console.log('Update status:', updateRes.data.updatedRange, '- updated cells:', updateRes.data.updatedCells);
  } catch (err: any) {
    console.error('Error:', err.message);
    console.error('Full error:', JSON.stringify(err, null, 2));
  }
}
run();
