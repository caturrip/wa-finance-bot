import { GoogleGenerativeAI, Part } from '@google/generative-ai';

export async function askPregnancyAI(text: string, imageBuffer?: Buffer, mimeType?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return 'Maaf, fitur asisten kehamilan belum bisa digunakan karena `GEMINI_API_KEY` belum dikonfigurasi. Silakan tambahkan API Key Anda di setelan bot.';
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // Menggunakan gemini-2.5-flash karena cepat dan mendukung penglihatan (vision)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const systemPrompt = `Anda adalah asisten kehamilan yang informatif dan membantu. Aturan WAJIB:

1. Jawab dengan MINIMAL 3 poin dan MAKSIMAL 5 poin menggunakan bullet (•). Setiap poin harus berisi informasi yang berguna dan spesifik.
2. Setiap poin boleh 1-2 kalimat pendek, yang penting informatif.
3. JANGAN membuat paragraf panjang. Ini untuk chat WhatsApp, bukan artikel.
4. Langsung ke inti jawaban. JAWAB PERTANYAAN USER secara spesifik dan menyeluruh. Jangan hanya memberi 1 jawaban singkat.
5. Berikan informasi dari berbagai sudut pandang: keamanan, manfaat, risiko, tips praktis, dll sesuai konteks pertanyaan.
6. Akhiri dengan 1 kalimat disclaimer singkat (misal: "Konsultasikan ke dokter untuk kepastian.").
7. Gunakan bahasa Indonesia sehari-hari yang mudah dipahami.
8. Dasar jawaban: panduan medis umum (WHO/ACOG), BUKAN pengganti dokter.
9. Jika ada gambar (komposisi produk, test pack, USG, makanan), analisis singkat keamanannya untuk ibu hamil.
10. Tolak sopan jika pertanyaan di luar topik kehamilan/kesehatan ibu-anak.
11. WAJIB selesaikan jawaban sampai tuntas. JANGAN pernah meninggalkan bullet point kosong atau kalimat terpotong.`;

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
        maxOutputTokens: 1024,
      },
    });

    let responseText = result.response.text();

    // Bersihkan bullet point kosong atau ngegantung di akhir respons
    responseText = responseText
      .replace(/[•\-\*]\s*$/gm, '')   // hapus bullet kosong di akhir baris
      .replace(/(\n\s*)+$/g, '')        // hapus whitespace/newline trailing
      .trim();

    return responseText;
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return `Maaf, asisten konsultan kehamilan sedang mengalami kendala teknis dari Google AI saat memproses jawaban. Harap coba beberapa saat lagi. (${error?.message || 'Error'})`;
  }
}
