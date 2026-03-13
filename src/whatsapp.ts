import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { addTransaction, getSummary } from './db';
import { exportToSheet } from './sheets';

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  }
});

client.on('qr', (qr) => {
  console.log('Scan QR Code below to authenticate WhatsApp bot:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('WhatsApp bot is ready!');
});

client.on('message', async (message) => {
  const text = message.body.trim();
  const args = text.split(' ');
  const command = args[0].toLowerCase();
  
  if (command === '!ping') {
    return message.reply('pong');
  }

  if (command === '!add') {
    if (args.length < 4) {
      return message.reply('Format salah. Gunakan:\n!add <income/expense> <jumlah> <deskripsi>');
    }

    const type = args[1].toLowerCase();
    if (type !== 'income' && type !== 'expense') {
      return message.reply('Tipe harus "income" atau "expense".');
    }

    const amount = parseFloat(args[2]);
    if (isNaN(amount)) {
      return message.reply('Jumlah harus berupa angka.');
    }

    const description = args.slice(3).join(' ');

    try {
      await addTransaction({
        userId: message.from,
        platform: 'whatsapp',
        type: type as 'income' | 'expense',
        amount,
        description,
      });
      message.reply(`Berhasil mencatat ${type === 'income' ? 'pemasukan' : 'pengeluaran'} sebesar Rp${amount} untuk "${description}".`);
    } catch (error) {
      console.error(error);
      message.reply('Terjadi kesalahan saat mencatat transaksi.');
    }
  } else if (command === '!summary') {
    const typeArgs = args[1]?.toLowerCase() === 'monthly' ? 'monthly' : 'daily';

    try {
      const summary = await getSummary(message.from, typeArgs);
      
      let replyText = `Rekapitulasi ${typeArgs === 'monthly' ? 'Bulanan' : 'Harian'}:\n\n`;
      replyText += `Pemasukan: Rp${summary.income}\n`;
      replyText += `Pengeluaran: Rp${summary.expense}\n`;
      replyText += `Saldo: Rp${summary.balance}\n\n`;
      
      replyText += `Daftar Transaksi ${typeArgs === 'monthly' ? 'Bulan Ini' : 'Hari Ini'}:\n`;
      summary.transactions.forEach((t: any) => {
        replyText += `- ${t.type === 'income' ? '+' : '-'}Rp${t.amount} (${t.description})\n`;
      });

      if (summary.transactions.length === 0) {
        replyText += 'Belum ada transaksi dicatat.';
      }

      message.reply(replyText);
    } catch (error) {
      console.error(error);
      message.reply('Terjadi kesalahan saat mengambil rekapitulasi.');
    }
  } else if (command === '!export') {
    try {
      message.reply('Mengekspor data ke Google Sheets...');
      const summary = await getSummary(message.from, 'monthly');
      const success = await exportToSheet(summary.transactions);
      
      if (success) {
        message.reply('Berhasil mengekspor data bulan ini ke Google Sheets.');
      } else {
        message.reply('Gagal mengekspor data. Pastikan konfigurasi kredensial Google Sheets di server (environment variables) sudah diatur dengan benar.');
      }
    } catch (error) {
      console.error(error);
      message.reply('Terjadi kesalahan saat mengekspor data.');
    }
  } else if (command === '!help') {
    message.reply('Selamat datang di Catur Finance Bot! Gunakan perintah berikut:\n\n!add <income/expense> <jumlah> <deskripsi>\n!summary <daily/monthly>\n!export\n\nContoh:\n!add expense 50000 makan siang');
  }
});

export const startWhatsAppBot = () => {
  console.log('Initializing WhatsApp bot...');
  client.initialize();
};
