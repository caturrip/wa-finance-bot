import 'dotenv/config';
import http from 'http';
import { startTelegramBot } from './telegram';
import { startWhatsAppBot } from './whatsapp';

console.log('Starting Finance Bots...');

startTelegramBot();
startWhatsAppBot();

// HTTP server kecil agar Render.com tidak mematikan service (keep-alive)
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Catur Finance Bot is running! 🚀');
});

server.listen(PORT, () => {
  console.log(`Keep-alive server berjalan di port ${PORT}`);
});
