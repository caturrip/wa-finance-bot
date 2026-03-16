import dotenv from 'dotenv';
import { exportToSheet } from './src/sheets';

dotenv.config({ override: true });

console.log('starting export test...');
console.log('GOOGLE_SPREADSHEET_ID (env):', process.env.GOOGLE_SPREADSHEET_ID);

(async () => {
  try {
    await exportToSheet([
      {
        id: 'test',
        userId: 'test',
        platform: 'whatsapp',
        type: 'expense',
        amount: 123,
        description: 'Test | Export',
        timestamp: new Date().toISOString(),
      },
    ]);
    console.log('export success');
  } catch (err) {
    console.error('export failed', err);
  }
})();
