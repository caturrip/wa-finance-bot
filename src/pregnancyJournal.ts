import { exportToJurnal } from './sheets';
import { askPregnancyAI } from './pregnancyAI';
import schedule from 'node-schedule';
import fs from 'fs';
import path from 'path';

// Simpan config di dalam auth_info_baileys karena folder ini di-mount ke Volume presisten di Railway
const DATA_FILE = path.resolve(__dirname, '../auth_info_baileys/pregnancy_config.json');

interface PregnancyConfig {
  obgynDate?: string; // YYYY-MM-DD
  userId?: string;    // Wa ID for notifications
}

function loadConfig(): PregnancyConfig {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) {}
  return {};
}

function saveConfig(config: PregnancyConfig) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
       fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Gagal menyimpan config kehamilan:', e);
  }
}

export function saveReminderUser(userId: string) {
  const config = loadConfig();
  if (config.userId !== userId) {
    config.userId = userId;
    saveConfig(config);
  }
}

export function saveObgynDate(userId: string, dateStr: string) {
  const config = loadConfig();
  config.userId = userId;
  config.obgynDate = dateStr;
  saveConfig(config);
}

export function getObgynDate(): string | undefined {
  return loadConfig().obgynDate;
}

export function initPregnancyReminders(sendMessage: (jid: string, text: string) => Promise<void>) {
  // 1. Reminder Vitamin (Setiap jam 20:00)
  schedule.scheduleJob('0 20 * * *', async () => {
    const config = loadConfig();
    if (config.userId) {
      try {
        await sendMessage(config.userId, `💊 *Waktunya Minum Vitamin!*\n\nHalo Bunda, jangan lupa untuk meminum suplemen/vitamin kehamilan hari ini ya demi nutrisi dan kesehatan janin optimal! ❤️`);
      } catch(e) {}
    }
  });

  // 2. Reminder Obgyn H-3 (Setiap jam 09:00 pagi)
  schedule.scheduleJob('0 9 * * *', async () => {
    const config = loadConfig();
    if (config.userId && config.obgynDate) {
      try {
        const apptDate = new Date(config.obgynDate);
        const today = new Date();
        
        apptDate.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        
        const diffTime = apptDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 3) {
          await sendMessage(config.userId, `🩺 *Pengingat Jadwal Obgyn!*\n\nHalo Bunda, 3 hari lagi (tanggal ${config.obgynDate}) adalah jadwal periksa kandungan (USG) lho. Jangan lupa persiapkan waktu dan list daftar pertanyaan ke dokter!`);
        } else if (diffDays === 1) {
          await sendMessage(config.userId, `🩺 *Besok Jadwal Obgyn!*\n\nBesok adalah hari H jadwal periksa kandungan. Jangan lupa bawa buku KIA dan dokumen kesehatan Bunda ya!`);
        } else if (diffDays === 0) {
          await sendMessage(config.userId, `🩺 *Hari Ini Jadwal Obgyn!*\n\nHari ini jadwal periksa kandungan (USG) ya Bunda. Semoga dedek bayinya perkembangannya sehat sempurna!`);
        }
      } catch (e) {}
    }
  });
  console.log('✅ Sistem Pengingat Hamil (Vitamin & Obgyn) telah diaktifkan!');
}

export async function processJournalEntry(keluhan: string): Promise<string> {
  // Lakukan request empati dan saran ringan via AI
  const prompt = `Sebagai konsultan kehamilan yang edukatif dan penuh empati, bacalah curhatan/jurnal harian dari ibu hamil ini: "${keluhan}". Berikan dukungan psikologis, menenangkan kecemasan, dan saran tindakan praktis singkat jika diperlukan. Jangan terlalu panjang, maksimal 3 paragraf pendek saja. Ingatkan bahwa ini respon AI edukatif.`;
  
  const saranAI = await askPregnancyAI(prompt);
  
  // Simpan ke Google Sheets otomatis
  await exportToJurnal(new Date(), keluhan, saranAI);
  
  return saranAI;
}
