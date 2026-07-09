import { transcribeAudio } from "../src/lib/ai/ai-service";
import fs from "fs";

async function run() {
  console.log("=== INICIANDO TESTE DE TRANSCRIÇÃO (SIMULAÇÃO EVOLUTION) ===");
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("ERRO: OPENAI_API_KEY não encontrada no arquivo .env");
    return;
  }

  console.log("1. Baixando um áudio de exemplo da internet...");
  const publicAudioUrl = "https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg";
  const audioResponse = await fetch(publicAudioUrl);
  const audioBuffer = await audioResponse.arrayBuffer();
  
  console.log("2. Convertendo áudio para Base64 (simulando o webhook da Evolution)...");
  const base64Audio = Buffer.from(audioBuffer).toString("base64");
  
  console.log("3. Chamando a nova função transcribeAudio passando o Base64...\n");
  
  // Passando undefined para a URL, e o base64Media como terceiro argumento
  const text = await transcribeAudio(undefined, apiKey, base64Audio);
  
  console.log("\n=== RESULTADO ===");
  if (text) {
    console.log("✅ Transcrição bem-sucedida!");
    console.log("Texto gerado pela OpenAI: ", text);
  } else {
    console.log("❌ Falha na transcrição.");
  }
}

run();
