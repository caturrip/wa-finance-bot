import { Telegraf, Markup } from 'telegraf';
import { addTransaction, getSummary } from './db';
import { exportToSheet } from './sheets';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');
const userStates = new Map<string, { step: string, type?: string, source?: string, payment?: string, desc?: string }>();

bot.start((ctx) => {
  ctx.reply('Selamat datang di Catur Finance Bot! Gunakan perintah berikut:\n\n/add - Tambah transaksi baru\n/summary <daily/monthly> - Rekap transaksi\n/export - Export ke Google Sheets');
});

bot.command('add', (ctx) => {
  userStates.set(ctx.from.id.toString(), { step: 'AWAITING_TYPE' });
  ctx.reply('Pilih tipe transaksi:', Markup.inlineKeyboard([
    [
      Markup.button.callback('💵 Income', 'type_income'),
      Markup.button.callback('💸 Expense', 'type_expense')
    ]
  ]));
});

bot.action('type_income', (ctx) => {
  ctx.answerCbQuery();
  userStates.set(ctx.from.id.toString(), { step: 'AWAITING_SOURCE', type: 'income' });
  ctx.editMessageText('Pilih sumber pemasukan:', Markup.inlineKeyboard([
    [Markup.button.callback('Gaji Catur', 'src_Gaji Catur'), Markup.button.callback('Gaji Vermita', 'src_Gaji Vermita')],
    [Markup.button.callback('Panvers Store', 'src_Panvers Store')],
    [Markup.button.callback('THR Catur', 'src_THR Catur'), Markup.button.callback('THR Vermita', 'src_THR Vermita')],
    [Markup.button.callback('Lainnya', 'src_Lainnya')]
  ]));
});

bot.action('type_expense', (ctx) => {
  ctx.answerCbQuery();
  userStates.set(ctx.from.id.toString(), { step: 'AWAITING_SOURCE', type: 'expense' });
  ctx.editMessageText('Pilih jenis pengeluaran:', Markup.inlineKeyboard([
    [Markup.button.callback('Makanan & Minuman', 'src_Makanan & Minuman'), Markup.button.callback('Entertaint', 'src_Entertaint')],
    [Markup.button.callback('Sedekah', 'src_Sedekah'), Markup.button.callback('Listrik', 'src_Listrik')],
    [Markup.button.callback('Laundry', 'src_Laundry'), Markup.button.callback('Kontrakan', 'src_Kontrakan')],
    [Markup.button.callback('Cicilan', 'src_Cicilan'), Markup.button.callback('Orang Tua', 'src_Orang Tua')],
    [Markup.button.callback('Transportasi', 'src_Transportasi'), Markup.button.callback('Uang Harian', 'src_Uang Harian')]
  ]));
});

bot.action(/^src_(.+)$/, (ctx) => {
  ctx.answerCbQuery();
  const source = ctx.match[1];
  const userId = ctx.from.id.toString();
  const state = userStates.get(userId);
  
  if (state && state.step === 'AWAITING_SOURCE') {
    state.source = source;
    
    if (state.type === 'expense') {
      state.step = 'AWAITING_PAYMETH';
      ctx.editMessageText('Pilih Metode Pembayaran:', Markup.inlineKeyboard([
        [Markup.button.callback('BCA', 'pay_BCA'), Markup.button.callback('BRI', 'pay_BRI')],
        [Markup.button.callback('MANDIRI', 'pay_MANDIRI'), Markup.button.callback('CASH', 'pay_CASH')],
        [Markup.button.callback('SEABANK', 'pay_SEABANK'), Markup.button.callback('OVO', 'pay_OVO')],
        [Markup.button.callback('DANA', 'pay_DANA'), Markup.button.callback('BLU', 'pay_BLU')],
        [Markup.button.callback('GOPAY', 'pay_GOPAY'), Markup.button.callback('JAGO', 'pay_JAGO')]
      ]));
    } else {
      state.step = 'AWAITING_DESC';
      ctx.editMessageText(`Masukkan deskripsi untuk *${source}*\n(Contoh: Gaji Maret, atau ketik \`-\` untuk skip)`, { parse_mode: 'Markdown' });
    }
  }
});

bot.action(/^pay_(.+)$/, (ctx) => {
  ctx.answerCbQuery();
  const payment = ctx.match[1];
  const userId = ctx.from.id.toString();
  const state = userStates.get(userId);
  
  if (state && state.step === 'AWAITING_PAYMETH') {
    state.step = 'AWAITING_DESC';
    state.payment = payment;
    ctx.editMessageText(`Masukkan deskripsi untuk pengeluaran *${state.source}* via *${payment}*\n(Contoh: Makan Siang, atau ketik \`-\` untuk skip)`, { parse_mode: 'Markdown' });
  }
});

bot.on('text', async (ctx, next) => {
  // If it's a command, let other handlers process it
  if (ctx.message.text.startsWith('/')) return next();

  const userId = ctx.from.id.toString();
  const state = userStates.get(userId);

  if (state && state.step === 'AWAITING_DESC') {
    state.desc = ctx.message.text === '-' ? '' : ctx.message.text;
    state.step = 'AWAITING_AMOUNT';
    const label = state.payment ? `*${state.source}* via *${state.payment}*` : `*${state.source}*`;
    return ctx.reply(`Masukkan jumlah uang untuk ${label}\n(Contoh: 50000)`, { parse_mode: 'Markdown' });
  } else if (state && state.step === 'AWAITING_AMOUNT') {
    const amount = parseFloat(ctx.message.text);
    if (isNaN(amount)) {
      return ctx.reply('Jumlah harus berupa angka. Silakan masukkan nominal yang benar (Contoh: 50000):');
    }
    
    const finalDescription = state.payment ? `${state.source} (${state.payment})|${state.desc || ''}` : `${state.source}|${state.desc || ''}`;
    
    try {
      await addTransaction({
        userId,
        platform: 'telegram',
        type: state.type as 'income' | 'expense',
        amount,
        description: finalDescription,
      });
      ctx.reply(`✅ Berhasil mencatat ${state.type === 'income' ? 'pemasukan' : 'pengeluaran'} sebesar Rp${amount} untuk "${state.source}" - ${state.desc || '-'}.`);
      userStates.delete(userId);
    } catch (error: any) {
      console.error('Error when saving transaction:', error);
      const message = error?.message
        ? ` (${error.message})`
        : ` (${String(error)})`;
      ctx.reply(`❌ Terjadi kesalahan saat mencatat transaksi.${message}`);
    }
  } else {
    return next();
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
