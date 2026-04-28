async function testToken() {
  const apiKey = "ic8uDAzWcSRKwqWig8KvFTQmFviAu6GeDyHC9Xv1w72j";
  const secret = "hXHdnVdXJjpFa9sAcrvFv1JusXSZociEo3QUSTnK1yr1";
  
  const urls = [
    "https://tramitacaointeligente.com.br/api/v1/clientes",
    "https://api.tramitacaointeligente.com.br/v1/clientes"
  ];

  for (const url of urls) {
    console.log(`\n--- Testing ${url} ---`);
    
    // Test Bearer with API Key
    console.log("Bearer with API Key...");
    const r1 = await fetch(url, { headers: { "Authorization": `Bearer ${apiKey}` } });
    console.log(`Result: ${r1.status}`);

    // Test Bearer with Secret
    console.log("Bearer with Secret...");
    const r2 = await fetch(url, { headers: { "Authorization": `Bearer ${secret}` } });
    console.log(`Result: ${r2.status}`);

    // Test Basic Auth (API:Secret)
    console.log("Basic Auth (API:Secret)...");
    const basic = Buffer.from(`${apiKey}:${secret}`).toString("base64");
    const r3 = await fetch(url, { headers: { "Authorization": `Basic ${basic}` } });
    console.log(`Result: ${r3.status}`);

    // Test X-Api-Key
    console.log("X-Api-Key header...");
    const r4 = await fetch(url, { headers: { "X-Api-Key": apiKey } });
    console.log(`Result: ${r4.status}`);
  }
}

testToken();
