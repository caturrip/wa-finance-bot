import { google } from 'googleapis';
import { getAuthToken } from '../src/sheets';
import dotenv from 'dotenv';
dotenv.config();

async function inspect() {
  const spreadSheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const auth = await getAuthToken();
  if (!auth) throw new Error('No auth');
  const sheets = google.sheets({ version: 'v4', auth });
  const monthName = 'Mar';

  const readRes = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadSheetId,
    range: `${monthName}!H14:L30`,
  });
  console.log(JSON.stringify(readRes.data.values, null, 2));
}

inspect().catch(console.error);
