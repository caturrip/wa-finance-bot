import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as QRCode from 'qrcode-terminal';
import { addTransaction, getSummary } from './db';
import { exportToSheet } from './sheets';
import { inferTransactionFromText, parseAmount } from './utils';

const logger = pino({ level: 'info' }); // Diubah ke info untuk melihat log penting

export let latestQr: string | null = null;

const userStates = new Map<string, {
  step: string,
  type?: string,
  source?: string,
  payment?: string,
  desc?: string
}>();

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      console.log('\n==================================================');
      console.log('SCAN QR CODE DI BAWAH INI:');
      console.log('==================================================\n');
      
      QRCode.generate(qr, { small: true });
      
      console.log('\n==================================================');
      console.log('Atau buka link ini jika QR di atas terpotong/rusak:');
      console.log(`http://localhost:${process.env.PORT || 3000}`);
      console.log('==================================================\n');
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus. Reconnect:', shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp(); // reconnect otomatis
      } else {
        console.log('Logged out. Silakan hapus folder auth_info_baileys dan restart bot.');
      }
    } else if (connection === 'open') {
      console.log('WhatsApp bot is ready!');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid!;
      // Abaikan pesan dari grup
      if (from.endsWith('@g.us')) continue;

      let text = '';
      try {
        const m = msg.message;
        text = m.conversation || m.extendedTextMessage?.text || '';
      } catch (e) {
        console.error('Error extracting message text:', e);
      }

      text = text.trim();
      console.log(`[MSG] dari ${from}: "${text}"`);

      if (!text) continue;

      const args = text.split(' ');
      const command = args[0].toLowerCase();
      const userId = from;
      const state = userStates.get(userId);

      const reply = (replyText: string) =>
        sock.sendMessage(from, { text: replyText });

      // === COMMANDS ===
      if (command === '!ping') {
        await reply('pong');
        continue;
      }

      if (command === '!add') {
        // Quick-add automation: !add <income|expense> <amount> [source] [description...]
        if (args.length > 2) {
          const typeArg = args[1].toLowerCase();
          if (typeArg === 'income' || typeArg === 'expense') {
            // Temukan token angka terakhir yang valid sebagai amount
            let amount: number | null = null;
            let amountIndex = -1;
            for (let i = args.length - 1; i >= 2; i--) {
              const parsed = parseAmount(args[i]);
              if (!isNaN(parsed)) {
                amount = parsed;
                amountIndex = i;
                break;
              }
            }

            if (amount !== null && amountIndex > 1) {
              const sourceTokens = args.slice(2, amountIndex);
              const descTokens = args.slice(amountIndex + 1);

              const source = sourceTokens.length ? sourceTokens.join(' ') : 'Auto';
              const desc = descTokens.length ? descTokens.join(' ') : '';
              const finalDescription = `${source}|${desc}`;

              try {
                await addTransaction({
                  userId,
                  platform: 'whatsapp',
                  type: typeArg as 'income' | 'expense',
                  amount,
                  description: finalDescription,
                });
                await reply(
                  `✅ Berhasil mencatat ${typeArg === 'income' ? 'pemasukan' : 'pengeluaran'} sebesar Rp${amount.toLocaleString('id-ID')} (${source}${desc ? ` - ${desc}` : ''}).`
                );
                continue;
              } catch (error: any) {
                console.error('Error when saving transaction (quick add):', error);
                const message = error?.message ? ` (${error.message})` : ` (${String(error)})`;
                await reply(`❌ Terjadi kesalahan saat mencatat transaksi.${message}`);
                continue;
              }
            }
          }
        }

        userStates.set(userId, { step: 'AWAITING_TYPE' });
        await reply(
          `Pilih tipe transaksi (Balas angka):\n\n1️⃣ Pemasukan (Income)\n2️⃣ Pengeluaran (Expense)`
        );
        continue;
      }

      if (command === '!summary') {
        const typeArg = args[1]?.toLowerCase() === 'monthly' ? 'monthly' : 'daily';
        try {
          const summary = await getSummary(userId, typeArg);
          let replyText = `Rekapitulasi ${typeArg === 'monthly' ? 'Bulanan' : 'Harian'}:\n\n`;
          replyText += `Pemasukan: Rp${summary.income}\n`;
          replyText += `Pengeluaran: Rp${summary.expense}\n`;
          replyText += `Saldo: Rp${summary.balance}\n\n`;
          replyText += `Daftar Transaksi ${typeArg === 'monthly' ? 'Bulan Ini' : 'Hari Ini'}:\n`;
          summary.transactions.forEach((t: any) => {
            replyText += `- ${t.type === 'income' ? '+' : '-'}Rp${t.amount} (${t.description})\n`;
          });
          if (summary.transactions.length === 0) replyText += 'Belum ada transaksi.';
          await reply(replyText);
        } catch (err) {
          await reply('Terjadi kesalahan saat mengambil rekapitulasi.');
        }
        continue;
      }

      if (command === '!export') {
        try {
          await reply('Mengekspor data ke Google Sheets...');
          const summary = await getSummary(userId, 'monthly');
          await exportToSheet(summary.transactions);
          await reply('✅ Berhasil mengekspor data bulan ini.');
        } catch (err: any) {
          console.error('Export error:', err);
          const message = err?.message ? ` (${err.message})` : '';
          await reply(`❌ Gagal mengekspor data.${message}`);
        }
        continue;
      }

      if (command === '!help' || command === '!menu') {
        await reply(
          'Catur Finance Bot 💰\n\n' +
          '!add → Tambah transaksi baru (atau: !add income 50000 Gaji)\n' +
          '!summary daily → Rekap hari ini\n' +
          '!summary monthly → Rekap bulan ini\n' +
          '!export → Export ke Google Sheets'
        );
        continue;
      }

      // === AUTOMATION: coba parse transaksi dari teks biasa (misal "Beli Astor 25rb") ===
      const isCommandMessage = command.startsWith('!');
      if (!isCommandMessage && !state) {
        const inferred = inferTransactionFromText(text);
        if (inferred) {
          try {
            await addTransaction({
              userId,
              platform: 'whatsapp',
              type: inferred.type,
              amount: inferred.amount,
              description: `${inferred.source}|${inferred.description}`,
            });
            await reply(
              `✅ Otomatis mencatat ${inferred.type === 'income' ? 'pemasukan' : 'pengeluaran'} sebesar Rp${inferred.amount.toLocaleString('id-ID')} (${inferred.source}).`
            );
            continue;
          } catch (error: any) {
            console.error('Error when saving transaction (auto):', error);
            const message = error?.message ? ` (${error.message})` : ` (${String(error)})`;
            await reply(`❌ Terjadi kesalahan saat mencatat transaksi otomatis.${message}`);
            continue;
          }
        }
      }

      // === CONVERSATION FLOW ===
      if (state) {
        if (state.step === 'AWAITING_TYPE') {
          if (text === '1') {
            state.step = 'AWAITING_SOURCE';
            state.type = 'income';
            await reply(
              `Pilih sumber pemasukan (Balas angka):\n\n1️⃣ Gaji Catur\n2️⃣ Gaji Vermita\n3️⃣ Panvers Store\n4️⃣ THR Catur\n5️⃣ THR Vermita\n6️⃣ Lainnya`
            );
          } else if (text === '2') {
            state.step = 'AWAITING_SOURCE';
            state.type = 'expense';
            await reply(
              `Pilih jenis pengeluaran (Balas angka):\n\n1️⃣ Makanan & Minuman\n2️⃣ Entertaint\n3️⃣ Sedekah\n4️⃣ Listrik\n5️⃣ Laundry\n6️⃣ Kontrakan\n7️⃣ Cicilan\n8️⃣ Orang Tua\n9️⃣ Transportasi\n🔟 Uang Harian`
            );
          } else {
            await reply('❌ Pilihan tidak valid. Balas dengan angka 1 atau 2.');
          }

        } else if (state.step === 'AWAITING_SOURCE') {
          const incomeSources = ['Gaji Catur', 'Gaji Vermita', 'Panvers Store', 'THR Catur', 'THR Vermita', 'Lainnya'];
          const expenseSources = ['Makanan & Minuman', 'Entertaint', 'Sedekah', 'Listrik', 'Laundry', 'Kontrakan', 'Cicilan', 'Orang Tua', 'Transportasi', 'Uang Harian'];
          const sources = state.type === 'income' ? incomeSources : expenseSources;
          const index = parseInt(text) - 1;

          if (index >= 0 && index < sources.length) {
            state.source = sources[index];
            if (state.type === 'expense') {
              state.step = 'AWAITING_PAYMETH';
              await reply(
                `Pilih Metode Pembayaran (Balas angka):\n\n1️⃣ BCA\n2️⃣ BRI\n3️⃣ MANDIRI\n4️⃣ CASH\n5️⃣ SEABANK\n6️⃣ OVO\n7️⃣ DANA\n8️⃣ BLU\n9️⃣ GOPAY\n🔟 JAGO`
              );
            } else {
              state.step = 'AWAITING_DESC';
              await reply(`Masukkan deskripsi untuk *${sources[index]}*\n(Contoh: Gaji Maret, atau ketik - untuk skip)`);
            }
          } else {
            await reply(`❌ Pilihan tidak valid. Balas dengan angka yang sesuai.`);
          }

        } else if (state.step === 'AWAITING_PAYMETH') {
          const paymentMethods = ['BCA', 'BRI', 'MANDIRI', 'CASH', 'SEABANK', 'OVO', 'DANA', 'BLU', 'GOPAY', 'JAGO'];
          const index = parseInt(text) - 1;

          if (index >= 0 && index < paymentMethods.length) {
            state.step = 'AWAITING_DESC';
            state.payment = paymentMethods[index];
            await reply(`Masukkan deskripsi untuk *${state.source}* via *${state.payment}*\n(Contoh: Makan Siang, atau ketik - untuk skip)`);
          } else {
            await reply(`❌ Pilihan tidak valid. Balas dengan angka 1 sampai ${paymentMethods.length}.`);
          }

        } else if (state.step === 'AWAITING_DESC') {
          state.desc = text === '-' ? '' : text;
          state.step = 'AWAITING_AMOUNT';
          const label = state.payment
            ? `*${state.source}* via *${state.payment}*`
            : `*${state.source}*`;
          await reply(`Masukkan jumlah uang untuk ${label}\n(Contoh: 50000)`);

        } else if (state.step === 'AWAITING_AMOUNT') {
          const amount = parseAmount(text);
          if (isNaN(amount)) {
            await reply('❌ Jumlah harus berupa angka (Contoh: 50000 atau 50.000).');
            continue;
          }

          const finalDescription = state.payment
            ? `${state.source} (${state.payment})|${state.desc || ''}`
            : `${state.source}|${state.desc || ''}`;

          try {
            await addTransaction({
              userId,
              platform: 'whatsapp',
              type: state.type as 'income' | 'expense',
              amount,
              description: finalDescription,
            });
            await reply(
              `✅ Berhasil mencatat ${state.type === 'income' ? 'pemasukan' : 'pengeluaran'} sebesar Rp${amount.toLocaleString('id-ID')} untuk "${state.source}" - ${state.desc || '-'}.`
            );
            userStates.delete(userId);
          } catch (error: any) {
            console.error('Error when saving transaction:', error);
            const message = error?.message
              ? ` (${error.message})`
              : ` (${String(error)})`;
            await reply(`❌ Terjadi kesalahan saat mencatat transaksi.${message}`);
          }
        }
      }
    }
  });

  return sock;
}

export const startWhatsAppBot = () => {
  console.log('Initializing WhatsApp bot (Baileys)...');
  connectToWhatsApp().catch(console.error);
};
