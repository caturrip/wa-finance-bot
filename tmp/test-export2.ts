import { exportToSheet } from '../src/sheets';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const dummyTx = [
    {
      timestamp: new Date(),
      type: 'expense',
      amount: 145000,
      description: 'Uang Harian (JAGO)|Beli Gorengan Anjay',
      platform: 'whatsapp',
    }
  ];
  
  console.log('Testing exportToSheet with new format...');
  try {
    const success = await exportToSheet(dummyTx);
    console.log('Result:', success);
  } catch (err: any) {
    console.error('ERROR:', err.message);
    if (err.errors) console.error('Details:', JSON.stringify(err.errors, null, 2));
  }
}

run();
