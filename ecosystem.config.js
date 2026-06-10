// Configuração do PM2 para rodar o AdvZap em uma VM dedicada.
// Uso: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "advzap",
      script: "node_modules/next/dist/bin/next",
      args: "start -p " + (process.env.PORT || "3000"),
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
