/**
 * Ecosystem PM2 do vtres60-blog. Dois processos:
 *
 * 1) vtres60-blog: o site Next.js em si (`next start -p 3002`), como ja
 *    rodava antes desta config existir.
 * 2) vtres60-agent-worker: micro-worker interno (agent-worker.mjs) que
 *    substitui o cron-job.org externo, disparando /api/agent/cron as
 *    05h e 17h via node-cron. Processo separado do site: se um cair, o
 *    outro continua no ar.
 *
 * Carrega .env.production explicitamente e injeta no `env` de cada app
 * de proposito: o daemon do PM2 nesta maquina tem SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY (sem prefixo NEXT_PUBLIC_) de um projeto
 * Supabase antigo, herdados por todo processo em fork mode. Como o nome
 * SUPABASE_SERVICE_ROLE_KEY colide exatamente com o que o app le em
 * runtime, e Next.js nao sobrescreve env var ja definida no processo,
 * esse valor antigo teria precedencia sobre o .env.production correto e
 * quebraria a conexao com o Supabase ("Invalid API key"). Definir aqui,
 * explicitamente, garante que o valor certo sempre vença.
 */
const path = require("node:path");
const { config } = require("dotenv");

const parsed = config({ path: path.join(__dirname, ".env.production") }).parsed ?? {};

module.exports = {
  apps: [
    {
      name: "vtres60-blog",
      cwd: __dirname,
      script: "npm",
      args: "start -- -p 3002",
      env: { ...parsed, NODE_ENV: "production" },
    },
    {
      name: "vtres60-agent-worker",
      cwd: __dirname,
      script: "agent-worker.mjs",
      env: { ...parsed, NODE_ENV: "production" },
      autorestart: true,
    },
  ],
};
