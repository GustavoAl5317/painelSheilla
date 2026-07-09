import { transcribeAudio } from "../src/lib/ai/ai-service";
import fs from "fs";
import fetch from "node-fetch";

async function run() {
  console.log("Testing audio fetch...");
  // I will just mock it or try a public audio url
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("No OPENAI_API_KEY");
    return;
  }
  const publicAudio = "https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg";
  const text = await transcribeAudio(publicAudio, apiKey);
  console.log("Transcribed:", text);
}

run();
