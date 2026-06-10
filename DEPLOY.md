# Deploy em VM dedicada

Este projeto roda em uma VM dedicada (Linux) usando Node.js + PM2 + Nginx, sem
depender de Vercel.

## 1. Pré-requisitos na VM

- Node.js 20+ e npm
- PostgreSQL (local ou gerenciado)
- PM2 (`npm install -g pm2`)
- Nginx (proxy reverso + TLS)

## 2. Variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto com, no mínimo:

```
DATABASE_URL=postgresql://usuario:senha@localhost:5432/advzap
NEXTAUTH_URL=https://seu-dominio.com.br
NEXTAUTH_SECRET=...
CRON_SECRET=...
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=...
```

Outras chaves opcionais (OpenAI, Anthropic, Trello, DJEN, PJe etc.) podem ser
configuradas pelo `.env` (`envFallback`) ou pela tela
**Configurações → Credenciais** de cada organização.

## 3. Build e start

```sh
npm install
npm run build   # roda prisma migrate deploy + next build
pm2 start ecosystem.config.js
pm2 save
```

`pm2 startup` configura o PM2 para subir automaticamente no boot da VM.

## 4. Nginx (proxy reverso)

Aponte o domínio para a porta da aplicação (padrão 3000):

```nginx
server {
    listen 80;
    server_name seu-dominio.com.br;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Use `certbot` para emitir o certificado TLS.

## 5. Jobs agendados (cron)

A Vercel Cron foi substituída por crontab do Linux. Os endpoints continuam
existindo em `/api/cron/*` e são protegidos por `CRON_SECRET`.

```sh
crontab scripts/crontab.example
```

Edite `scripts/crontab.example` antes de instalar (ajuste `APP_URL`,
`CRON_SECRET` e o caminho do projeto).

## 6. Webhook do WhatsApp (Evolution API)

Configure na Evolution API o webhook apontando para:

```
https://seu-dominio.com.br/api/webhook/whatsapp?org=<slug-da-organizacao>
```

E preencha em **Configurações → Credenciais → WhatsApp — Evolution API**:

- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE`

## 7. Atualizações (deploy de novas versões)

```sh
git pull
npm install
npm run build
pm2 restart advzap
```
