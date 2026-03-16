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

const logger = pino({ level: 'silent' }); // silent agar terminal tidak ramai

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

      const text = (
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.buttonsResponseMessage?.selectedButtonId ||
        msg.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
        msg.message.templateButtonReplyMessage?.selectedId ||
        (msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ? JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson).id : '') ||
        ''
      ).trim();

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
          viewOnceMessage: {
            message: {
              interactiveMessage: {
                header: { title: "*Tambah Transaksi*", hasMediaAttachment: false },
                body: { text: "Silakan pilih tipe transaksi di bawah ini:" },
                footer: { text: "Catur Finance Bot" },
                nativeFlowMessage: {
                  buttons: [
                    {
                      name: "quick_reply",
                      buttonParamsJson: JSON.stringify({ display_text: "💰 Pemasukan (Income)", id: "1" })
                    },
                    {
                      name: "quick_reply",
                      buttonParamsJson: JSON.stringify({ display_text: "💸 Pengeluaran (Expense)", id: "2" })
                    }
                  ]
                }
              }
            }
          }
        } as any);
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
          viewOnceMessage: {
            message: {
              interactiveMessage: {
                header: { title: "*Catur Finance Bot*", hasMediaAttachment: false },
                body: { text: "Halo! Pilih menu di bawah ini untuk mengelola keuanganmu:\n\nMode: *Interactive Menu*" },
                footer: { text: "© Catur Finance Bot" },
                nativeFlowMessage: {
                  buttons: [
                    {
                      name: "single_select",
                      buttonParamsJson: JSON.stringify({
                        title: "Buka Menu Utama",
                        sections: [
                          {
                            title: "Transaksi & Laporan",
                            rows: [
                              { title: "➕ Tambah Transaksi", description: "Catat pemasukan/pengeluaran baru", id: "!add" },
                              { title: "📊 Rekap Harian", description: "Lihat ringkasan transaksi hari ini", id: "!summary daily" },
                              { title: "📅 Rekap Bulanan", description: "Lihat ringkasan transaksi bulan ini", id: "!summary monthly" },
                              { title: "📤 Export Sheets", description: "Export data ke Google Sheets", id: "!export" },
                            ]
                          }
                        ]
                      })
                    }
                  ]
                }
              }
            }
          }
        } as any);
        continue;
      }

      // === CONVERSATION FLOW ===
      if (state) {
        if (state.step === 'AWAITING_TYPE') {
          if (text === '1') {
            state.step = 'AWAITING_SOURCE';
            state.type = 'income';
            
            const incomeSources = ['Gaji Catur', 'Gaji Vermita', 'Panvers Store', 'THR Catur', 'THR Vermita', 'Lainnya'];
            const rows = incomeSources.map((s, i) => ({
              title: s,
              id: (i + 1).toString()
            }));

            await sock.sendMessage(from, {
              viewOnceMessage: {
                message: {
                  interactiveMessage: {
                    body: { text: "Pilih sumber pemasukan:" },
                    nativeFlowMessage: {
                      buttons: [{
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                          title: "Pilih Sumber",
                          sections: [{ title: "Sumber Pemasukan", rows }]
                        })
                      }]
                    }
                  }
                }
              }
            } as any);
          } else if (text === '2') {
            state.step = 'AWAITING_SOURCE';
            state.type = 'expense';
            
            const expenseSources = ['Makanan & Minuman', 'Entertaint', 'Sedekah', 'Listrik', 'Laundry', 'Kontrakan', 'Cicilan', 'Orang Tua', 'Transportasi', 'Uang Harian'];
            const rows = expenseSources.map((s, i) => ({
              title: s,
              id: (i + 1).toString()
            }));

            await sock.sendMessage(from, {
              viewOnceMessage: {
                message: {
                  interactiveMessage: {
                    body: { text: "Pilih jenis pengeluaran:" },
                    nativeFlowMessage: {
                      buttons: [{
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({
                          title: "Pilih Jenis",
                          sections: [{ title: "Jenis Pengeluaran", rows }]
                        })
                      }]
                    }
                  }
                }
              }
            } as any);
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
              const rows = paymentMethods.map((p, i) => ({
                title: p,
                id: (i + 1).toString()
              }));

              await sock.sendMessage(from, {
                viewOnceMessage: {
                  message: {
                    interactiveMessage: {
                      body: { text: `Pilih Metode Pembayaran untuk *${sources[index]}*:` },
                      nativeFlowMessage: {
                        buttons: [{
                          name: "single_select",
                          buttonParamsJson: JSON.stringify({
                            title: "Pilih Metode",
                            sections: [{ title: "Metode Pembayaran", rows }]
                          })
                        }]
                      }
                    }
                  }
                }
              } as any);
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
