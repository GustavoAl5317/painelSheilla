async function testToken() {
  const keys = [
    "ic8uDAzWcSRKwqWig8KvFTQmFviAu6GeDyHC9Xv1w72j",
    "hXHdnVdXJjpFa9sAcrvFv1JusXSZociEo3QUSTnK1yr1",
    "ic8uDAzWcSRKwqWig8KvFTQmFviAu6GeDyHC9Xv1w72j:hXHdnVdXJjpFa9sAcrvFv1JusXSZociEo3QUSTnK1yr1"
  ];
  const url = "https://tramitacaointeligente.com.br/api/v1/clientes";

  for (const token of keys) {
    console.log(`Testing token: ${token.slice(0, 10)}...`);
    try {
      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json"
        }
      });
      console.log(`Result: ${res.status} ${res.statusText}`);
      if (res.ok) {
        console.log("Success with this token!");
        return;
      }
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }
  }
}

testToken();
