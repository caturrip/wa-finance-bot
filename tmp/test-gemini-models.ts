import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('No API KEY');
    return;
  }
  
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  const models = data.models.map((m: any) => m.name).filter((name: string) => name.includes('gemini'));
  console.log(JSON.stringify(models, null, 2));
}

run();
