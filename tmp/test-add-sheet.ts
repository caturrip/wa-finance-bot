import dotenv from 'dotenv';
dotenv.config();
import { exportToSheet } from '../src/sheets';

async function testExport() {
  const transaction = {
    id: 'test-id-123',
    userId: 'test-user',
    platform: 'whatsapp',
    type: 'expense',
    amount: 15000,
    description: 'Makanan & Minuman (CASH)|Beli Bakso',
    timestamp: new Date()
  };

  console.log('Testing exportToSheet...');
  try {
    await exportToSheet([transaction]);
    console.log('Export successful!');
  } catch (err) {
    console.error('Export failed:', err);
  }
}

testExport();
