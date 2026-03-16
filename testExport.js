import 'dotenv/config';
import { exportToSheet } from './src/sheets';

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
