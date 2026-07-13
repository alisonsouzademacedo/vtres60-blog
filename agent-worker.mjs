/**
 * Micro-worker de cron interno do agente autonomo. Substitui o
 * cron-job.org externo (que falhou) — roda como processo PM2 separado
 * (vtres60-agent-worker, ver ecosystem.config.js) e dispara POST em
 * /api/agent/cron duas vezes ao dia (05h e 17h, America/Sao_Paulo), no
 * mesmo endpoint e com a mesma autenticacao que o cron-job.org usava
 * (ver src/lib/agent/require-agent-auth.ts). O endpoint responde 202 e
 * roda o grafo em segundo plano (Next.js `after()`), entao este worker
 * so precisa confirmar que o disparo foi aceito, nao esperar a
 * publicacao terminar.
 *
 * Processo devidamente separado do Next.js: se o worker cair, o site
 * continua no ar; se o site reiniciar (deploy), o worker nao e afetado.
 *
 * Extensao .mjs (ESM) por convencao do projeto (todo o resto do codigo
 * usa `import`) e porque package.json nao declara "type":"module" — um
 * .js comum aqui rodaria como CommonJS e o ESLint do projeto proibe
 * `require()`.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import cron from "node-cron";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envFile = fs.existsSync(path.join(__dirname, ".env.production")) ? ".env.production" : ".env.local";
config({ path: path.join(__dirname, envFile), override: true });

// Porta e basePath tem que bater com o processo real do Next.js no PM2
// (ver ecosystem.config.js: `next start -p 3002`, e NEXT_PUBLIC_BASE_PATH
// em .env.production = "/blog"). Configuravel via env para nao quebrar se
// a porta mudar no futuro.
const PORT = process.env.PORT || 3002;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const AGENT_API_KEY = process.env.AGENT_API_KEY;
const CRON_URL = `http://localhost:${PORT}${BASE_PATH}/api/agent/cron`;
const TIMEZONE = "America/Sao_Paulo";

// Teto de espera pela resposta do POST (nao pelo pipeline inteiro, que
// roda em segundo plano no servidor via `after()` — so pelo aceite 202).
const REQUEST_TIMEOUT_MS = 30_000;

function log(message) {
  console.log(`[agent-worker] ${new Date().toISOString()} — ${message}`);
}

if (!AGENT_API_KEY) {
  log(`AVISO: AGENT_API_KEY nao definida (lido de ${envFile}). Toda chamada agendada sera rejeitada com 401 ate isso ser corrigido.`);
}

async function triggerAgentCron() {
  log(`Disparando execucao agendada em ${CRON_URL}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(CRON_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${AGENT_API_KEY ?? ""}` },
      signal: controller.signal,
    });
    const body = await response.text().catch(() => "");
    log(`Resposta ${response.status}: ${body}`);
  } catch (error) {
    // Nunca deixa a chamada de rede derrubar o worker — so registra e
    // espera o proximo horario agendado.
    log(`ERRO ao chamar /api/agent/cron: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

cron.schedule("0 5 * * *", triggerAgentCron, { timezone: TIMEZONE });
cron.schedule("0 17 * * *", triggerAgentCron, { timezone: TIMEZONE });

log(`Worker iniciado. Agendado para 05:00 e 17:00 (${TIMEZONE}). Alvo: ${CRON_URL}`);

// Rede de seguranca: uma excecao nao tratada aqui NUNCA deve matar o
// processo do PM2 (isso deixaria o agendamento inteiro parado ate
// alguem notar). So registra e segue rodando.
process.on("unhandledRejection", (reason) => {
  log(`unhandledRejection capturada (worker continua rodando): ${reason instanceof Error ? reason.stack : reason}`);
});
process.on("uncaughtException", (error) => {
  log(`uncaughtException capturada (worker continua rodando): ${error.stack || error}`);
});
