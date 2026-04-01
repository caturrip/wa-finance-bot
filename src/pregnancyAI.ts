import { GoogleGenerativeAI, Part } from '@google/generative-ai';

export async function askPregnancyAI(text: string, imageBuffer?: Buffer, mimeType?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return 'Maaf, fitur asisten kehamilan belum bisa digunakan karena `GEMINI_API_KEY` belum dikonfigurasi. Silakan tambahkan API Key Anda di setelan bot.';
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // Menggunakan gemini-2.5-flash karena cepat dan mendukung penglihatan (vision)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const systemPrompt = `Anda adalah asisten kehamilan yang ringkas dan informatif. Aturan WAJIB:

1. Jawab MAKSIMAL 3-5 poin singkat menggunakan bullet (•) atau emoji.
2. Setiap poin MAKSIMAL 1 kalimat pendek.
3. JANGAN membuat paragraf panjang. Ini untuk chat WhatsApp, bukan artikel.
4. Langsung ke inti jawaban, tanpa basa-basi atau kata pembuka.
5. Akhiri dengan 1 kalimat disclaimer singkat jika perlu (misal: "Konsultasikan ke dokter untuk kepastian").
6. Gunakan bahasa Indonesia sehari-hari yang mudah dipahami.
7. Dasar jawaban: panduan medis umum (WHO/ACOG), BUKAN pengganti dokter.
8. Jika ada gambar (komposisi produk, test pack, USG, makanan), analisis singkat keamanannya untuk ibu hamil.
9. Tolak sopan jika pertanyaan di luar topik kehamilan/kesehatan ibu-anak.`;

  try {
    const parts: Part[] = [];
    
    if (imageBuffer && mimeType) {
      parts.push({
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType,
        },
      });
      // Jika hanya mengirim gambar tanpa deskripsi teks, asumsikan user minta opini ttg keamanannya
      if (!text || text.trim() === '') {
        text = 'Tolong analisis gambar ini, apakah produk atau makanan ini aman untuk ibu hamil?';
      }
    }
    
    parts.push({ text: `${systemPrompt}\n\nPertanyaan: ${text}` });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        maxOutputTokens: 500,
      },
    });

    const responseText = result.response.text();
    return responseText;
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return `Maaf, asisten konsultan kehamilan sedang mengalami kendala teknis dari Google AI saat memproses jawaban. Harap coba beberapa saat lagi. (${error?.message || 'Error'})`;
  }
}
