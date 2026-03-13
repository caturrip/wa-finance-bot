import 'dotenv/config';
import { startTelegramBot } from './telegram';
import { startWhatsAppBot } from './whatsapp';

console.log('Starting Finance Bots...');

startTelegramBot();
startWhatsAppBot();

console.log('Both bots have been invoked to start.');
