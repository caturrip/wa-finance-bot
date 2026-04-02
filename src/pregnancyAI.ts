import { GoogleGenerativeAI, Part } from '@google/generative-ai';

export async function askPregnancyAI(text: string, imageBuffer?: Buffer, mimeType?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return 'Maaf, fitur asisten kehamilan belum bisa digunakan karena `GEMINI_API_KEY` belum dikonfigurasi. Silakan tambahkan API Key Anda di setelan bot.';
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const systemPrompt = `Kamu adalah asisten kehamilan di WhatsApp. PATUHI format ini TANPA PENGECUALIAN:

FORMAT JAWABAN:
• Poin 1: [penjelasan 1-2 kalimat]
• Poin 2: [penjelasan 1-2 kalimat]
• Poin 3: [penjelasan 1-2 kalimat]
(minimal 3 poin, maksimal 5 poin)

Konsultasikan ke dokter untuk kepastian.

ATURAN KETAT:
- Setiap bullet (•) HARUS diikuti teks penjelasan. DILARANG bullet kosong.
- JANGAN gunakan sub-bullet, header, atau format lain selain bullet (•).
- Bahasa Indonesia sehari-hari, singkat, langsung ke inti.
- Jawab dari sudut pandang: keamanan, manfaat, risiko, tips praktis.
- Akhiri dengan 1 kalimat disclaimer.
- Dasar: panduan medis umum (WHO/ACOG), bukan pengganti dokter.
- Jika ada gambar, analisis keamanannya untuk ibu hamil.
- Tolak sopan jika di luar topik kehamilan/kesehatan ibu-anak.
- PASTIKAN jawaban LENGKAP dan SELESAI. Jangan berhenti di tengah kalimat.`;

  try {
    const parts: Part[] = [];
    
    if (imageBuffer && mimeType) {
      parts.push({
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType,
        },
      });
      if (!text || text.trim() === '') {
        text = 'Tolong analisis gambar ini, apakah produk atau makanan ini aman untuk ibu hamil?';
      }
    }
    
    parts.push({ text: `${systemPrompt}\n\nPertanyaan: ${text}` });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        maxOutputTokens: 2048,
      },
    });

    let responseText = result.response.text();

    // === Bersihkan respons yang terpotong atau ngegantung ===
    responseText = responseText
      // Hapus baris yang hanya berisi bullet tanpa isi (•, -, *, atau variasi dengan spasi)
      .replace(/^\s*[•\-\*]\s*\*?\s*$/gm, '')
      // Hapus baris yang hanya berisi angka + titik tanpa isi (misal "3. ")
      .replace(/^\s*\d+\.\s*$/gm, '')
      // Hapus header markdown yang ngegantung (misal "### " tanpa teks setelahnya)
      .replace(/^\s*#{1,6}\s*$/gm, '')
      // Hapus kalimat terpotong di akhir (baris terakhir yang tidak diakhiri tanda baca)
      .replace(/\n[^•\-\*\n]*[a-zA-Z]\s*$/g, (match) => {
        // Hanya hapus jika baris terakhir tampak terpotong (tidak diakhiri ., !, ?, atau ))
        const trimmed = match.trim();
        if (trimmed && !/[.!?)"]$/.test(trimmed)) {
          return '';
        }
        return match;
      })
      // Hapus multiple newlines berturut-turut
      .replace(/\n{3,}/g, '\n\n')
      // Hapus whitespace/newline di akhir
      .replace(/(\n\s*)+$/g, '')
      .trim();

    // Jika respons kosong setelah dibersihkan, berikan fallback
    if (!responseText || responseText.length < 20) {
      return 'Maaf, saya tidak bisa memberikan jawaban yang lengkap saat ini. Silakan coba tanyakan lagi dengan pertanyaan yang lebih spesifik.';
    }

    return responseText;
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return `Maaf, asisten konsultan kehamilan sedang mengalami kendala teknis dari Google AI saat memproses jawaban. Harap coba beberapa saat lagi. (${error?.message || 'Error'})`;
  }
}

