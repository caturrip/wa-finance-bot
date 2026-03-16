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
    throw new Error('GOOGLE_SPREADSHEET_ID is not set');
  }

  const auth = await getAuthToken();
  if (!auth) {
    throw new Error('Google Sheets auth token could not be created (check GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY)');
  }

  const sheets = google.sheets({ version: 'v4', auth });

  if (transactions.length === 0) return;

  // Dictionary for Indonesian month names according to the Google Sheet tabs
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ];

  try {
    const expenseByMonth: { [month: string]: any[] } = {};
    const incomeByMonth: { [month: string]: { kategori: string, tanggal: string, amount: number }[] } = {};
    
    for (const t of transactions) {
      const date = new Date(t.timestamp);
      const monthName = monthNames[date.getMonth()];
      
      // Parse format "Kategori (MetodeBayar)|Deskripsi" dari description
      let kategoriStr = t.description;
      let metodeBayar = '-';
      let deskripsiStr = '-';
      
      // Split by pipe untuk mendapatkan deskripsi
      const pipeParts = t.description.split('|');
      const mainPart = pipeParts[0].trim();
      if (pipeParts[1] !== undefined && pipeParts[1].trim() !== '') {
        deskripsiStr = pipeParts[1].trim();
      }

      // Parse kategori dan metode bayar dari mainPart
      kategoriStr = mainPart;
      if (mainPart.includes('(') && mainPart.includes(')')) {
        const parts = mainPart.split('(');
        kategoriStr = parts[0].trim();
        metodeBayar = parts[1].replace(')', '').trim();
      }

      // Format tanggal
      const longDate = date.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });

      if (t.type === 'expense') {
        if (!expenseByMonth[monthName]) expenseByMonth[monthName] = [];
        expenseByMonth[monthName].push([
          longDate,       // H: TANGGAL
          metodeBayar,    // I: METODE BAYAR
          kategoriStr,    // J: KATEGORI
          deskripsiStr,   // K: DESKRIPSI
          t.amount,       // L: Actual
        ]);
      } else {
        // Income: simpan untuk dicocokkan ke baris existing berdasarkan KATEGORI
        if (!incomeByMonth[monthName]) incomeByMonth[monthName] = [];
        incomeByMonth[monthName].push({ kategori: kategoriStr, tanggal: longDate, amount: t.amount });
      }
    }

    // === EXPENSE: Append ke kolom H:L pada baris kosong pertama ===
    for (const monthName of Object.keys(expenseByMonth)) {
      const values = expenseByMonth[monthName];

      // Baca kolom H dari baris 14 ke bawah (baris 13 = header: STATUS/TANGGAL/dll, baris 14 = data pertama)
      const DATA_START_ROW = 14;
      const readRes = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadSheetId,
        range: `${monthName}!H${DATA_START_ROW}:H1000`,
      });
      
      const rows = readRes.data.values || [];
      // Cari baris kosong pertama mulai dari DATA_START_ROW
      let firstEmptyRow = DATA_START_ROW + rows.length; // default: setelah data terakhir
      for (let i = 0; i < rows.length; i++) {
        if (!rows[i] || !rows[i][0] || rows[i][0].trim() === '') {
          firstEmptyRow = DATA_START_ROW + i; // 1-indexed
          break;
        }
      }

      // Tulis data ke kolom H:L mulai dari baris kosong pertama
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadSheetId,
        range: `${monthName}!H${firstEmptyRow}:L${firstEmptyRow + values.length - 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values },
      });
    }

    // === INCOME: Cari baris berdasarkan KATEGORI di kolom B, lalu isi A (tanggal) dan E (ACTUAL) ===
    for (const monthName of Object.keys(incomeByMonth)) {
      const incomeEntries = incomeByMonth[monthName];

      // Baca seluruh kolom A:E untuk menemukan baris berdasarkan nama kategori
      const readRes = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadSheetId,
        range: `${monthName}!A1:E50`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      });

      const allRows = readRes.data.values || [];

      for (const entry of incomeEntries) {
        // Cari baris yang kolom B-nya (index 1) cocok dengan kategori
        const rowIndex = allRows.findIndex(row => {
          const kategoriCell = (row[1] || '').toString().trim().toLowerCase();
          return kategoriCell === entry.kategori.toLowerCase();
        });

        if (rowIndex === -1) {
          console.warn(`Kategori pemasukan "${entry.kategori}" tidak ditemukan di sheet ${monthName}.`);
          continue;
        }

        const targetRow = rowIndex + 1; // 1-indexed

        // Update kolom A (tanggal) dan E (ACTUAL) pada baris tersebut
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: spreadSheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: [
              { range: `${monthName}!A${targetRow}`, values: [[entry.tanggal]] },
              { range: `${monthName}!E${targetRow}`, values: [[entry.amount]] },
            ],
          },
        });
      }
    }

    return true;
  } catch (error: any) {
    console.error('Error exporting to specific sheet:', error);
    throw error;
  }
}

