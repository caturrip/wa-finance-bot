import { GoogleGenerativeAI, Part } from '@google/generative-ai';

export async function askPregnancyAI(text: string, imageBuffer?: Buffer, mimeType?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return 'Maaf, fitur asisten kehamilan belum bisa digunakan karena `GEMINI_API_KEY` belum dikonfigurasi. Silakan tambahkan API Key Anda di setelan bot.';
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // Menggunakan gemini-2.5-flash karena cepat dan mendukung penglihatan (vision)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const systemPrompt = `Anda adalah seorang asisten berpengetahuan luas, ramah, dan empatik yang bertugas khusus memberikan informasi mengenai kehamilan, nutrisi (trimester 1, 2, 3), pantangan, kegiatan yang dihindari, serta saran medis standar kehamilan. Selalu ingat bahwa jawaban Anda didasarkan pada panduan medis umum (seperti WHO atau ACOG) namun tidak menggantikan diagnosa dokter. Gunakan bahasa Indonesia yang mudah dimengerti, suportif, dan menenangkan layaknya seorang ahli kandungan profesional. Jawab langsung ke intinya dan jangan terlalu panjang kecuali diminta.\n\nJika pengguna mengirimkan gambar (misal daftar komposisi/ingredients suatu produk, alat test pack, USG, atau makanan), analisis apakah bahan-bahan atau kondisi tersebut aman/relevan untuk ibu hamil, lalu jelaskan alasannya.\n\nJika pengguna bertanya hal-hal di luar topik kehamilan, persalinan, kesehatan anak, atau di luar relevansi keluarga, tolak dengan sopan dan kembalikan ke topik kesehatan ibu dan anak.`;

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
    
    parts.push({ text: `${systemPrompt}\n\nPertanyaan Pengguna: ${text}` });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
    });

    const responseText = result.response.text();
    return responseText;
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return `Maaf, asisten konsultan kehamilan sedang mengalami kendala teknis dari Google AI saat memproses jawaban. Harap coba beberapa saat lagi. (${error?.message || 'Error'})`;
  }
}
