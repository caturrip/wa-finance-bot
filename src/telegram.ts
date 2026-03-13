import { Telegraf } from 'telegraf';
import { addTransaction, getSummary } from './db';
import { exportToSheet } from './sheets';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

bot.start((ctx) => {
  ctx.reply('Selamat datang di Catur Finance Bot! Gunakan perintah berikut:\n\n/add <income/expense> <jumlah> <deskripsi>\n/summary <daily/monthly>\n/export\n\nContoh:\n/add expense 50000 makan siang');
});

bot.command('add', async (ctx) => {
  const message = ctx.message.text.split(' ');
  if (message.length < 4) {
    return ctx.reply('Format salah. Gunakan:\n/add <income/expense> <jumlah> <deskripsi>');
  }

  const type = message[1].toLowerCase();
  if (type !== 'income' && type !== 'expense') {
    return ctx.reply('Tipe harus "income" atau "expense".');
  }

  const amount = parseFloat(message[2]);
  if (isNaN(amount)) {
    return ctx.reply('Jumlah harus berupa angka.');
  }

  const description = message.slice(3).join(' ');

  try {
    await addTransaction({
      userId: ctx.from.id.toString(),
      platform: 'telegram',
      type: type as 'income' | 'expense',
      amount,
      description,
    });
    ctx.reply(`Berhasil mencatat ${type === 'income' ? 'pemasukan' : 'pengeluaran'} sebesar Rp${amount} untuk "${description}".`);
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat mencatat transaksi.');
  }
});

bot.command('summary', async (ctx) => {
  const message = ctx.message.text.split(' ');
  const type = message[1]?.toLowerCase() === 'monthly' ? 'monthly' : 'daily';

  try {
    const summary = await getSummary(ctx.from.id.toString(), type);
    
    let replyText = `Rekapitulasi ${type === 'monthly' ? 'Bulanan' : 'Harian'}:\n\n`;
    replyText += `Pemasukan: Rp${summary.income}\n`;
    replyText += `Pengeluaran: Rp${summary.expense}\n`;
    replyText += `Saldo: Rp${summary.balance}\n\n`;
    
    replyText += `Daftar Transaksi ${type === 'monthly' ? 'Bulan Ini' : 'Hari Ini'}:\n`;
    summary.transactions.forEach((t: any) => {
      replyText += `- ${t.type === 'income' ? '+' : '-'}Rp${t.amount} (${t.description})\n`;
    });

    if (summary.transactions.length === 0) {
      replyText += 'Belum ada transaksi dicatat.';
    }

    ctx.reply(replyText);
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat mengambil rekapitulasi.');
  }
});

bot.command('export', async (ctx) => {
  try {
    ctx.reply('Mengekspor data ke Google Sheets...');
    const summary = await getSummary(ctx.from.id.toString(), 'monthly');
    const success = await exportToSheet(summary.transactions);
    
    if (success) {
      ctx.reply('Berhasil mengekspor data bulan ini ke Google Sheets.');
    } else {
      ctx.reply('Gagal mengekspor data. Pastikan konfigurasi kredensial Google Sheets di server (environment variables) sudah diatur dengan benar.');
    }
  } catch (error) {
    console.error(error);
    ctx.reply('Terjadi kesalahan saat mengekspor data.');
  }
});

export const startTelegramBot = () => {
  if (!process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN === 'your_telegram_bot_token') {
    console.warn('TELEGRAM_BOT_TOKEN is not correctly set. Telegram bot will not start.');
    return;
  }
  bot.launch();
  console.log('Telegram bot started.');
};

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
