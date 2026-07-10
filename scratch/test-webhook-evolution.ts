import fetch from "node-fetch";

async function run() {
  console.log("=== INICIANDO TESTE END-TO-END DO WEBHOOK (EVOLUTION API) ===");

  const orgSlug = "sheila-araujo-adv";
  const webhookUrl = `http://localhost:3000/api/webhook/whatsapp?org=${orgSlug}`;

  console.log("1. Baixando um áudio de exemplo da internet...");
  const publicAudioUrl = "https://upload.wikimedia.org/wikipedia/commons/c/c8/Example.ogg";
  const audioResponse = await fetch(publicAudioUrl);
  const audioBuffer = await audioResponse.arrayBuffer();
  
  console.log("2. Convertendo áudio para Base64...");
  const base64Audio = Buffer.from(audioBuffer).toString("base64");

  console.log("3. Montando o Payload Exato da Evolution API...");
  const evolutionPayload = {
    event: "messages.upsert",
    instance: "SheilaAdv",
    data: {
      key: {
        remoteJid: "5511999999999@s.whatsapp.net",
        fromMe: false,
        id: "BAE5ABCDEF1234567890"
      },
      pushName: "Cliente Teste",
      messageType: "audioMessage",
      message: {
        audioMessage: {
          url: "https://mmg.whatsapp.net/v/t62.7114-24/fake-url",
          mimetype: "audio/ogg; codecs=opus",
          fileSha256: "fake-sha256",
          fileLength: "12345",
          seconds: 5,
          ptt: true
        }
      },
      base64: base64Audio
    }
  };

  console.log(`4. Disparando POST para ${webhookUrl} ...\n`);
  
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evolutionPayload)
    });

    const responseText = await res.text();
    console.log(`=== RESULTADO DO WEBHOOK (Status: ${res.status}) ===`);
    console.log(responseText);
    
    if (res.ok) {
      console.log("\n✅ O Webhook recebeu e processou com sucesso! O áudio foi identificado e a IA foi acionada.");
      console.log("Dica: Verifique os logs do seu PM2 (pm2 logs) para ver a IA transcrevendo e gerando a resposta!");
    } else {
      console.log("\n❌ Houve um erro no recebimento do Webhook.");
    }
  } catch (error) {
    console.error("❌ Erro de conexão! O servidor (painel) está rodando no localhost:3000?", error);
  }
}

run();
