import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export async function getAuthToken() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.warn('Google Sheets configuration missing. Please set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.');
    return null;
  }

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: SCOPES
  });

  return auth;
}

export async function exportToSheet(transactions: any[]) {
  const spreadSheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadSheetId) {
    console.warn('Google Spreadsheet ID is not set.');
    return false;
  }

  const auth = await getAuthToken();
  if (!auth) return false;

  const sheets = google.sheets({ version: 'v4', auth });

  const values = transactions.map(t => [
    t.timestamp.toISOString(),
    t.type,
    t.amount,
    t.description,
    t.platform,
  ]);

  // Insert header
  values.unshift(['Date', 'Type', 'Amount', 'Description', 'Platform']);

  try {
    // We append to Sheet1 by default
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadSheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });
    return true;
  } catch (error) {
    console.error('Error exporting to specific sheet:', error);
    return false;
  }
}
