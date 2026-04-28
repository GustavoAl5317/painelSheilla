async function testToken() {
  const token = "zYVqQ3uUDJ6JSbmuB2HLLSqbZuUes35csp73iQHJQ3zP";
  const urls = [
    "https://tramitacaointeligente.com.br/api/v1/clientes",
    "https://api.tramitacaointeligente.com.br/v1/clientes",
    "https://api.tramitacaointeligente.com.br/api/v1/clientes"
  ];

  for (const url of urls) {
    console.log(`Testing ${url}...`);
    try {
      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json"
        }
      });
      console.log(`Result: ${res.status} ${res.statusText}`);
      if (res.ok) {
        const body = await res.json();
        console.log("Success! Body keys:", Object.keys(body));
        return;
      }
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }
}

testToken();
