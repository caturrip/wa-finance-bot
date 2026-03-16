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
        text = 
          m.conversation || 
          m.extendedTextMessage?.text || 
          m.buttonsResponseMessage?.selectedButtonId || 
          m.listResponseMessage?.singleSelectReply?.selectedRowId || 
          m.templateButtonReplyMessage?.selectedId || 
          '';

        // Cek Poll Update (Untuk menu tombol via Poll)
        if (m.pollUpdateMessage) {
            // Poll biasanya diproses via 'messages.update', tapi kita tambahkan basic check di sini
            // Untuk flow poll, kita akan kirim poll dan tangkap di flow biasa
        }

        // Cek Interactive Response
        if (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
          const params = JSON.parse(m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
          if (params.id) text = params.id;
        }

        // Cek ViewOnce
        if (!text && m.viewOnceMessage?.message) {
          const v = m.viewOnceMessage.message;
          text = v.conversation || v.extendedTextMessage?.text || '';
          if (v.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
            const params = JSON.parse(v.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
            if (params.id) text = params.id;
          }
        }
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
        userStates.set(userId, { step: 'AWAITING_TYPE' });
        
        await sock.sendMessage(from, {
          poll: {
            name: "Pilih tipe transaksi:",
            values: ["Pemasukan (Income)", "Pengeluaran (Expense)"],
            selectableCount: 1
          }
        });
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
          const success = await exportToSheet(summary.transactions);
          await reply(success ? 'Berhasil mengekspor data bulan ini.' : 'Gagal mengekspor data.');
        } catch (err) {
          await reply('Terjadi kesalahan saat mengekspor data.');
        }
        continue;
      }

      if (command === '!help' || command === '!menu') {
        await sock.sendMessage(from, {
          poll: {
            name: "Catur Finance Bot 💰\nSilakan pilih menu:",
            values: ["!add", "!summary daily", "!summary monthly", "!export"],
            selectableCount: 1
          }
        });
        continue;
      }

      // === CONVERSATION FLOW ===
      if (state) {
        if (state.step === 'AWAITING_TYPE') {
          if (text === '1' || text.toLowerCase().includes('pemasukan')) {
            state.step = 'AWAITING_SOURCE';
            state.type = 'income';
            const incomeSources = ['Gaji Catur', 'Gaji Vermita', 'Panvers Store', 'THR Catur', 'THR Vermita', 'Lainnya'];
            await sock.sendMessage(from, {
              poll: {
                name: "Pilih sumber pemasukan:",
                values: incomeSources,
                selectableCount: 1
              }
            });
          } else if (text === '2' || text.toLowerCase().includes('pengeluaran')) {
            state.step = 'AWAITING_SOURCE';
            state.type = 'expense';
            const expenseSources = ['Makanan & Minuman', 'Entertaint', 'Sedekah', 'Listrik', 'Laundry', 'Kontrakan', 'Cicilan', 'Orang Tua', 'Transportasi', 'Uang Harian'];
            await sock.sendMessage(from, {
              poll: {
                name: "Pilih jenis pengeluaran:",
                values: expenseSources,
                selectableCount: 1
              }
            });
          } else {
            await reply('❌ Pilihan tidak valid. Silakan pilih dari menu yang muncul.');
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
              const paymentMethods = ['BCA', 'BRI', 'MANDIRI', 'CASH', 'SEABANK', 'OVO', 'DANA', 'BLU', 'GOPAY', 'JAGO'];
              await sock.sendMessage(from, {
                poll: {
                  name: `Pilih Metode Pembayaran untuk *${sources[index]}*:`,
                  values: paymentMethods,
                  selectableCount: 1
                }
              });
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
          const amount = parseFloat(text);
          if (isNaN(amount)) {
            await reply('❌ Jumlah harus berupa angka (Contoh: 50000):');
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
          } catch (error) {
            console.error(error);
            await reply('❌ Terjadi kesalahan saat mencatat transaksi.');
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
