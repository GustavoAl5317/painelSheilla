async function testToken() {
  const apiKey = "ic8uDAzWcSRKwqWig8KvFTQmFviAu6GeDyHC9Xv1w72j";
  const url = "https://planilha.tramitacaointeligente.com.br/api/v1/clientes";

  console.log(`Testing ${url}...`);
  try {
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json"
      }
    });
    console.log(`Result: ${res.status} ${res.statusText}`);
  } catch (err) {
    console.log(`Error: ${err.message}`);
  }
}

testToken();
