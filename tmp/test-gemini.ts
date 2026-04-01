import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('No API KEY');
    return;
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  
  const modelsToTest = ['gemini-2.5-flash'];
  for (const modelName of modelsToTest) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('hello');
      console.log(`${modelName} success`);
      console.log(result.response.text());
    } catch (e: any) {
      console.log(`${modelName} error:`, e.message);
    }
  }
}

run();
