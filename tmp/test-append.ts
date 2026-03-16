import { exportToSheet } from '../src/sheets';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const dummyTx = [
    {
      timestamp: new Date(),
      type: 'expense',
      amount: 14500,
      description: 'Uang Harian (JAGO)',
      platform: 'whatsapp',
    }
  ];
  
  console.log('Sending to exportToSheet...');
  try {
    const success = await exportToSheet(dummyTx);
    console.log('Result:', success);
  } catch (err: any) {
    console.error('Error in script:', err.message);
  }
}

run();
