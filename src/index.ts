import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { startTelegramBot } from './telegram';
import { startWhatsAppBot, latestQr } from './whatsapp';

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

console.log('Starting Finance Bots...');

// Log which database URL is being used (masked for safety)
const dbUrl = process.env.DATABASE_URL || '<not set>';
const safeDbUrl = dbUrl.replace(/:\/\/[^@]+@/, '://****:****@');
console.log(`Using DATABASE_URL: ${safeDbUrl}`);

startTelegramBot();
startWhatsAppBot();

const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  
  if (latestQr) {
    // Menggunakan pembuat QR code yang lebih handal
    const qrImageUrl = `https://quickchart.io/qr?text=${encodeURIComponent(latestQr)}&size=300&margin=2`;
    res.end(`
      <html>
        <head>
          <meta http-equiv="refresh" content="30">
          <title>Scan WhatsApp QR</title>
        </head>
        <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; background: #f0f2f5; margin: 0;">
          <div style="background: white; padding: 2.5rem; border-radius: 1.5rem; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center; max-width: 400px;">
            <h1 style="color: #128c7e; margin-bottom: 0.5rem;">Scan WhatsApp</h1>
            <p style="color: #666; margin-bottom: 1.5rem;">Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat</p>
            <div style="background: #f9f9f9; padding: 1rem; border-radius: 1rem; display: inline-block;">
              <img src="${qrImageUrl}" alt="WhatsApp QR Code" style="display: block;" />
            </div>
            <p style="color: #999; font-size: 0.8rem; margin-top: 1.5rem;">Halaman ini otomatis refresh setiap 30 detik untuk memperbarui QR Code.</p>
          </div>
        </body>
      </html>
    `);
  } else {
    res.end(`
      <html>
        <head><meta http-equiv="refresh" content="10"></head>
        <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; background: #f0f2f5; margin: 0;">
          <div style="background: white; padding: 2.5rem; border-radius: 1.5rem; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center;">
            <h1 style="color: #128c7e;">Catur Finance Bot 🚀</h1>
            <p>Bot sedang berjalan.</p>
            <p style="color: #666;">Jika belum terhubung, QR akan muncul otomatis dalam beberapa saat...</p>
            <div style="margin-top: 2rem; border-top: 2px solid #eee; padding-top: 1rem;">
               <span style="color: #128c7e; font-weight: bold;">Status: Menunggu Koneksi / Sudah Terhubung</span>
            </div>
          </div>
        </body>
      </html>
    `);
  }
});

server.listen(PORT, () => {
  console.log(`Keep-alive server berjalan di port ${PORT}`);
});
