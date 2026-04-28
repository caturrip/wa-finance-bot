import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export async function getAuthToken() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.warn('Google Sheets configuration missing. Please set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.');
    return null;
  }

  let privateKey = process.env.GOOGLE_PRIVATE_KEY;
  // Handle various newline escapes
  privateKey = privateKey.replace(/\\n/g, '\n');
  privateKey = privateKey.replace(/"/g, ''); // Remove any accidental quotes

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
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
    const incomeByMonth: { [month: string]: { kategori: string, tanggal: string, amount: number, metodeBayar: string }[] } = {};
    
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
      let foundMetode = false;
      if (mainPart.includes('(') && mainPart.includes(')')) {
        const parts = mainPart.split('(');
        kategoriStr = parts[0].trim();
        metodeBayar = parts[1].replace(')', '').trim();
        foundMetode = true;
      } else {
        // Cek "pakai <metode>" di mainPart
        const pakaiMatch = mainPart.match(/pakai\s+([A-Za-z0-9]+)/i);
        if (pakaiMatch) {
          metodeBayar = pakaiMatch[1].toUpperCase();
          kategoriStr = mainPart.replace(/pakai\s+[A-Za-z0-9]+/i, '').trim();
          foundMetode = true;
        }
      }
      // Jika belum ketemu, cek di deskripsiStr
      if (!foundMetode && deskripsiStr && deskripsiStr !== '-') {
        const pakaiMatchDesc = deskripsiStr.match(/pakai\s+([A-Za-z0-9]+)/i);
        if (pakaiMatchDesc) {
          metodeBayar = pakaiMatchDesc[1].toUpperCase();
          deskripsiStr = deskripsiStr.replace(/pakai\s+[A-Za-z0-9]+/i, '').trim();
        }
      }

      // Format tanggal: "Monday, March 16, 2026"
      const formattedDate = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      if (t.type === 'expense') {
        if (!expenseByMonth[monthName]) expenseByMonth[monthName] = [];
        expenseByMonth[monthName].push([
          formattedDate,       // H: TANGGAL
          metodeBayar,    // I: METODE BAYAR
          kategoriStr,    // J: KATEGORI
          deskripsiStr,   // K: DESKRIPSI
          t.amount,       // L: Actual
        ]);
      } else {
        // Income: simpan untuk dicocokkan ke baris existing berdasarkan KATEGORI
        if (!incomeByMonth[monthName]) incomeByMonth[monthName] = [];
        incomeByMonth[monthName].push({ kategori: kategoriStr, tanggal: formattedDate, amount: t.amount, metodeBayar });
      }
    }

    // === EXPENSE: Append ke kolom H:L pada baris kosong pertama ===
    for (const monthName of Object.keys(expenseByMonth)) {
      const values = expenseByMonth[monthName];
      const DATA_START_ROW = 14;
      const readRes = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadSheetId,
        range: `${monthName}!H${DATA_START_ROW}:H1000`,
      });
      const rows = readRes.data.values || [];

      for (const value of values) {
        let targetRow = DATA_START_ROW + rows.length;
        let foundEmpty = false;
        
        // Cari baris kosong pertama (jika ada record yang telah dihapus)
        for (let i = 0; i < rows.length; i++) {
          if (!rows[i] || !rows[i][0] || rows[i][0].toString().trim() === '') {
            targetRow = DATA_START_ROW + i;
            foundEmpty = true;
            // Tandai baris kosong ini sudah terisi di lokal agar tidak ditimpa oleh perulangan berikutnya
            rows[i] = [value[0]];
            break;
          }
        }
        
        if (!foundEmpty) {
          targetRow = DATA_START_ROW + rows.length;
          rows.push([value[0]]);
        }

        // Tulis data ke kolom H:L pada baris targetRow
        await sheets.spreadsheets.values.update({
          spreadsheetId: spreadSheetId,
          range: `${monthName}!H${targetRow}:L${targetRow}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [value] },
        });
      }
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

        // Update kolom A (tanggal), C (metode bayar) dan E (ACTUAL) pada baris tersebut
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: spreadSheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: [
              { range: `${monthName}!A${targetRow}`, values: [[entry.tanggal]] },
              { range: `${monthName}!C${targetRow}`, values: [[entry.metodeBayar]] },
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

export async function getGoalsFromSheet() {
  const spreadSheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadSheetId) return [];

  const auth = await getAuthToken();
  if (!auth) return [];

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    // Asumsi: Ada tab bernama "Goals" dengan kolom:
    // A: Name, B: Target, C: Current, D: Deadline, E: Emoji, F: Color
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadSheetId,
      range: 'Goals!A2:F20', // Membaca dari baris 2 s.d 20
    });

    const rows = res.data.values || [];
    const goals = rows.map((row, index) => {
      const target = parseFloat(row[1]?.replace(/[^0-9.-]+/g, '') || '0');
      const current = parseFloat(row[2]?.replace(/[^0-9.-]+/g, '') || '0');
      
      return {
        id: `goal_${index}`,
        name: row[0] || 'Unknown Goal',
        target: isNaN(target) ? 0 : target,
        current: isNaN(current) ? 0 : current,
        deadline: row[3] || '',
        emoji: row[4] || '🎯',
        color: row[5] || 'from-finance-400 to-finance-600',
        icon: row[4] || '🎯',
      };
    });

    return goals;
  } catch (error) {
    console.warn('Gagal membaca tab Goals dari Google Sheets (mungkin tab tidak ada):', error);
    return null; // Return null to fallback to database
  }
}

// Helper untuk parsing tanggal format "Monday, March 16, 2026"
function parseDateString(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d;
}

export async function getAllTransactionsFromSheet() {
  const spreadSheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadSheetId) return [];

  const auth = await getAuthToken();
  if (!auth) return [];

  const sheets = google.sheets({ version: 'v4', auth });
  
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ];

  // Request batchGet untuk 12 bulan x 2 range (expense dan income) = 24 range
  const ranges: string[] = [];
  for (const month of monthNames) {
    ranges.push(`${month}!H14:L1000`); // Expense
    ranges.push(`${month}!A2:E50`);    // Income
  }

  try {
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: spreadSheetId,
      ranges: ranges,
    });

    const valueRanges = response.data.valueRanges || [];
    const transactions: any[] = [];
    const defaultUserId = '082246167772@s.whatsapp.net';

    let idCounter = 1;

    // Loop through valueRanges. Genap = Expense, Ganjil = Income
    for (let i = 0; i < valueRanges.length; i++) {
      const isExpense = i % 2 === 0;
      const rows = valueRanges[i].values || [];

      for (const row of rows) {
        if (isExpense) {
          // H: Tanggal, I: Metode Bayar, J: Kategori, K: Deskripsi, L: Amount
          if (!row[0] || !row[4]) continue;
          
          const dateStr = row[0].toString().trim();
          const metodeBayar = (row[1] || '').toString().trim();
          const kategori = (row[2] || 'Lainnya').toString().trim();
          const deskripsi = (row[3] || '').toString().trim();
          const amountStr = row[4].toString().replace(/[^0-9.-]+/g, '');
          const amount = parseFloat(amountStr);

          if (isNaN(amount) || amount === 0) continue;

          const timestamp = parseDateString(dateStr) || new Date();
          const finalDescription = metodeBayar !== '-' && metodeBayar !== '' 
            ? `${kategori} (${metodeBayar})|${deskripsi === '-' ? '' : deskripsi}`
            : `${kategori}|${deskripsi === '-' ? '' : deskripsi}`;

          transactions.push({
            id: `sheet_exp_${idCounter++}`,
            userId: defaultUserId,
            platform: 'whatsapp',
            type: 'expense',
            amount: amount,
            description: finalDescription,
            timestamp: timestamp
          });
        } else {
          // Income
          // A: Tanggal, B: Kategori, C: Metode Bayar, D: -, E: Amount
          if (!row[0] || !row[4]) continue;

          const dateStr = row[0].toString().trim();
          const kategori = (row[1] || 'Lainnya').toString().trim();
          const metodeBayar = (row[2] || '').toString().trim();
          const amountStr = row[4].toString().replace(/[^0-9.-]+/g, '');
          const amount = parseFloat(amountStr);

          if (isNaN(amount) || amount === 0) continue;

          const timestamp = parseDateString(dateStr) || new Date();
          const finalDescription = metodeBayar !== '-' && metodeBayar !== '' 
            ? `${kategori} (${metodeBayar})|`
            : `${kategori}|`;

          transactions.push({
            id: `sheet_inc_${idCounter++}`,
            userId: defaultUserId,
            platform: 'whatsapp',
            type: 'income',
            amount: amount,
            description: finalDescription,
            timestamp: timestamp
          });
        }
      }
    }

    // Sort transactions by date descending (newest first)
    transactions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return transactions;
  } catch (error) {
    console.error('Failed to batchGet transactions from Google Sheets:', error);
    return []; // Return empty array on error so dashboard doesn't break
  }
}


export async function deleteFromSheet(transaction: any) {
  const spreadSheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadSheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID is not set');
  }

  const auth = await getAuthToken();
  if (!auth) {
    throw new Error('Google Sheets auth token could not be created (check GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY)');
  }

  const sheets = google.sheets({ version: 'v4', auth });

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
  ];

  try {
    const date = new Date(transaction.timestamp);
    const monthName = monthNames[date.getMonth()];
    
    // Parse format "Kategori (MetodeBayar)|Deskripsi" dari description
    let kategoriStr = transaction.description;
    let metodeBayar = '-';
    let deskripsiStr = '-';

    const pipeParts = transaction.description.split('|');
    const mainPart = pipeParts[0].trim();
    if (pipeParts[1] !== undefined && pipeParts[1].trim() !== '') {
      deskripsiStr = pipeParts[1].trim();
    }

    kategoriStr = mainPart;
    let foundMetode = false;
    if (mainPart.includes('(') && mainPart.includes(')')) {
      const parts = mainPart.split('(');
      kategoriStr = parts[0].trim();
      metodeBayar = parts[1].replace(')', '').trim();
      foundMetode = true;
    } else {
      const pakaiMatch = mainPart.match(/pakai\s+([A-Za-z0-9]+)/i);
      if (pakaiMatch) {
        metodeBayar = pakaiMatch[1].toUpperCase();
        kategoriStr = mainPart.replace(/pakai\s+[A-Za-z0-9]+/i, '').trim();
        foundMetode = true;
      }
    }
    if (!foundMetode && deskripsiStr && deskripsiStr !== '-') {
      const pakaiMatchDesc = deskripsiStr.match(/pakai\s+([A-Za-z0-9]+)/i);
      if (pakaiMatchDesc) {
        metodeBayar = pakaiMatchDesc[1].toUpperCase();
        deskripsiStr = deskripsiStr.replace(/pakai\s+[A-Za-z0-9]+/i, '').trim();
      }
    }

    const formattedDate = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    if (transaction.type === 'expense') {
      const DATA_START_ROW = 14;
      const readResStr = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadSheetId,
        range: `${monthName}!H${DATA_START_ROW}:K1000`,
        valueRenderOption: 'FORMATTED_VALUE',
      });
      const readResNum = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadSheetId,
        range: `${monthName}!L${DATA_START_ROW}:L1000`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      });

      const strRows = readResStr.data.values || [];
      const numRows = readResNum.data.values || [];
      let targetRow = -1;

      for (let i = 0; i < strRows.length; i++) {
        const strRow = strRows[i] || [];
        const numRow = numRows[i] || [];

        const rDate = strRow[0] ? strRow[0].toString().trim() : '';
        const rMetode = strRow[1] ? strRow[1].toString().trim() : '';
        const rKategori = strRow[2] ? strRow[2].toString().trim() : '';
        const rDeskripsi = strRow[3] ? strRow[3].toString().trim() : '';
        
        const rAmount = numRow[0] != null ? Number(numRow[0]) : 0;
        
        if (rDate === formattedDate && 
            rMetode === metodeBayar && 
            rKategori === kategoriStr && 
            rDeskripsi === deskripsiStr && 
            rAmount === transaction.amount) {
          targetRow = DATA_START_ROW + i;
          break;
        }
      }

      if (targetRow !== -1) {
        await sheets.spreadsheets.values.clear({
          spreadsheetId: spreadSheetId,
          range: `${monthName}!H${targetRow}:L${targetRow}`,
        });
        console.log(`Cleared expense row ${targetRow} in sheet ${monthName}`);
      } else {
        console.warn('Row not found for deletion in expense sheet');
      }

    } else {
      // Income
      const readRes = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadSheetId,
        range: `${monthName}!A1:E50`,
      });
      const allRows = readRes.data.values || [];
      const rowIndex = allRows.findIndex(row => {
        const kCell = (row[1] || '').toString().trim().toLowerCase();
        return kCell === kategoriStr.toLowerCase();
      });

      if (rowIndex !== -1) {
        const targetRow = rowIndex + 1;
        await sheets.spreadsheets.values.batchClear({
          spreadsheetId: spreadSheetId,
          requestBody: {
            ranges: [
              `${monthName}!A${targetRow}`,
              `${monthName}!C${targetRow}`,
              `${monthName}!E${targetRow}`
            ]
          }
        });
        console.log(`Cleared income data at row ${targetRow} in sheet ${monthName}`);
      } else {
        console.warn('Row not found for deletion in income sheet');
      }
    }

    return true;
  } catch (error: any) {
    console.error('Error deleting from specific sheet:', error);
    throw error;
  }
}

export async function exportToJurnal(date: Date, keluhan: string, saranAI: string) {
  const spreadSheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadSheetId) return;

  const auth = await getAuthToken();
  if (!auth) return;

  const sheets = google.sheets({ version: 'v4', auth });
  const formattedDate = date.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadSheetId,
      range: 'Jurnal!A:C',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[formattedDate, keluhan, saranAI]]
      }
    });
  } catch (error: any) {
    console.error('Gagal export ke Jurnal (kemungkinan tab Jurnal belum dibuat):', error.message);
  }
}


