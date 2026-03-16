import { exportToSheet } from '../src/sheets';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const dummyIncome = [
    {
      timestamp: new Date(),
      type: 'income',
      amount: 12000000,
      description: 'THR Catur|',
      platform: 'whatsapp',
    }
  ];
  
  console.log('Testing income export: THR Catur...');
  try {
    const success = await exportToSheet(dummyIncome);
    console.log('Result:', success);
  } catch (err: any) {
    console.error('ERROR:', err.message);
  }
}

run();
