import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { config as dotenvConfig } from "dotenv";

/**
 * Fechamento da Fase 9B.1 — protege todo script de escrita contra destino
 * Supabase incorreto. Motivo: um script de migração escreveu 6 empresas
 * reais na tabela `companies` de PRODUÇÃO por engano durante a validação
 * (ver docs/implementacao-fase9b1-supabase-dominios.md, seção "Produção",
 * e feedback_vtres60_dotenv_override_true_risk.md) — a causa raiz foi
 * `dotenv.config({override:true})` fazendo `.env.local` (já restaurado
 * para credenciais reais de produção) vencer sobre variáveis de linha de
 * comando que ainda apontavam para um stack isolado.
 *
 * Este módulo é a correção compartilhada: todo script que pode escrever em
 * Supabase/Postgres/Storage deve usar `loadEnvSafely` (nunca
 * `override:true`) e `assertSafeToWrite` antes da primeira mutação real.
 */

const PRODUCTION_PROJECT_REF = "fdsojpwznvephwdoghbn";

const TARGET_ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export class EnvDestinationConflictError extends Error {
  readonly code = "ENV_DESTINATION_CONFLICT";
  constructor(public readonly conflictingKeys: string[]) {
    super(
      `ENV_DESTINATION_CONFLICT: variável(is) já presente(s) no processo com valor diferente do arquivo env — ${conflictingKeys.join(", ")}. Nenhuma escrita pode ocorrer até a divergência ser resolvida explicitamente (nunca escolhida silenciosamente).`,
    );
  }
}

/**
 * Carrega o arquivo env indicado SEM sobrescrever variáveis já presentes no
 * processo (dotenv `override` é `false` por padrão — nunca passar `true`
 * aqui). Precedência resultante:
 * 1) argumentos explícitos / variáveis já exportadas no processo (vencem
 *    sempre, por não serem sobrescritas pelo dotenv);
 * 2) arquivo indicado (`.env.local` por padrão), só para chaves ainda não
 *    definidas;
 * 3) nenhum default sensível é aplicado aqui.
 *
 * Antes de carregar, detecta conflito REAL: se uma variável já está
 * definida no processo E o arquivo define um valor DIFERENTE para a mesma
 * chave, isso é sinal de confusão operacional (foi exatamente o que
 * aconteceu no incidente) — a função aborta em vez de decidir sozinha, por
 * mais que a precedência "correta" fosse simplesmente manter o valor já
 * presente.
 */
export function loadEnvSafely(envFile = ".env.local"): void {
  const filePath = path.join(process.cwd(), envFile);
  const before: Partial<Record<(typeof TARGET_ENV_KEYS)[number], string>> = {};
  for (const key of TARGET_ENV_KEYS) before[key] = process.env[key];

  const parsed = dotenvConfig({ path: filePath }).parsed ?? {};

  const conflicts: string[] = [];
  for (const key of TARGET_ENV_KEYS) {
    const existing = before[key];
    const fileValue = parsed[key];
    if (existing !== undefined && fileValue !== undefined && existing !== fileValue) conflicts.push(key);
  }
  if (conflicts.length > 0) throw new EnvDestinationConflictError(conflicts);
}

export type DestinationKind = "LOCAL" | "TEST" | "STAGING" | "PRODUCTION" | "UNKNOWN";

export interface ResolvedDestination {
  kind: DestinationKind;
  hostname: string;
  port: string;
  projectRef: string | null;
}

/**
 * Identifica o destino a partir de NEXT_PUBLIC_SUPABASE_URL já resolvida —
 * nunca lê a service role key.
 *
 * TEST/STAGING existem no tipo porque o plano de fechamento da Fase 9B.1 os
 * exige explicitamente, mas este projeto NÃO tem um projeto Supabase real
 * de staging/test — todo teste isolado até hoje usa Postgres+PostgREST
 * local via Docker (kind=LOCAL, hostname=localhost), nunca um segundo
 * projeto Supabase hospedado. Por isso a função nunca INFERE TEST/STAGING a
 * partir de padrão de hostname (isso seria uma dedução, proibida pelo
 * protocolo de evidência) — só reconhece esses dois valores quando
 * declarados explicitamente via `SAFE_TARGET_ENV_LABEL=TEST|STAGING`, uma
 * variável de ambiente que um operador definiria manualmente se/quando um
 * projeto Supabase de staging real vier a existir. Até lá, qualquer
 * `*.supabase.co` que não seja o project ref de produção confirmado
 * permanece UNKNOWN (fail-closed), nunca um valor adivinhado.
 */
export function resolveDestination(): ResolvedDestination {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return { kind: "UNKNOWN", hostname: "", port: "", projectRef: null };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "UNKNOWN", hostname: url, port: "", projectRef: null };
  }
  const hostname = parsed.hostname;
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return { kind: "LOCAL", hostname, port, projectRef: null };
  }
  const match = /^([a-z0-9]+)\.supabase\.co$/.exec(hostname);
  const projectRef = match ? match[1] : null;
  if (projectRef === PRODUCTION_PROJECT_REF) return { kind: "PRODUCTION", hostname, port, projectRef };

  const explicitLabel = process.env.SAFE_TARGET_ENV_LABEL;
  if (explicitLabel === "TEST" || explicitLabel === "STAGING") return { kind: explicitLabel, hostname, port, projectRef };

  return { kind: "UNKNOWN", hostname, port, projectRef };
}

/** Só campos não sensíveis — nunca imprimir key/senha/token/connection string. */
export function describeDestination(destination: ResolvedDestination): string {
  return `kind=${destination.kind} hostname=${destination.hostname || "(vazio)"} port=${destination.port || "(n/a)"} projectRef=${destination.projectRef ?? "(n/a)"}`;
}

export interface ProductionGuardOptions {
  allowProduction: boolean;
  apply: boolean;
  dryRun: boolean;
  manifestGenerated: boolean;
  idempotencyKey: string | null;
  actor: string | null;
}

export class ProductionGuardError extends Error {
  readonly code = "FAIL_CLOSED";
}

/**
 * Bloqueia qualquer escrita antes da primeira mutação real, a menos que
 * todos os requisitos estejam presentes. Nunca depende de pergunta
 * interativa — só de argumentos/flags explícitos.
 */
export function assertSafeToWrite(destination: ResolvedDestination, options: ProductionGuardOptions): void {
  if (destination.kind === "UNKNOWN") {
    throw new ProductionGuardError(`FAIL_CLOSED: destino não identificado (${describeDestination(destination)}) — nenhuma escrita pode ocorrer.`);
  }
  if (destination.kind === "PRODUCTION") {
    const missing: string[] = [];
    if (!options.allowProduction) missing.push("--allow-production");
    if (destination.projectRef !== PRODUCTION_PROJECT_REF) missing.push("project ref exato");
    if (!options.apply) missing.push("--apply");
    if (options.dryRun) missing.push("dry-run precisa estar desativado");
    if (!options.manifestGenerated) missing.push("manifest");
    if (!options.idempotencyKey) missing.push("idempotency key");
    if (!options.actor) missing.push("ator registrado");
    if (missing.length > 0) {
      throw new ProductionGuardError(`FAIL_CLOSED: escrita em produção bloqueada — requisito(s) ausente(s): ${missing.join(", ")}.`);
    }
  }
}

export interface MigrationManifestInput {
  script: string;
  destination: ResolvedDestination;
  mode: "dry-run" | "apply";
  entities: string;
  quantity: number;
  ids: string[];
  rollbackPlan: string;
  actor?: string;
}

export interface MigrationManifest {
  timestamp: string;
  script: string;
  commit: string | null;
  destination: string;
  projectRef: string | null;
  mode: "dry-run" | "apply";
  entities: string;
  quantity: number;
  ids: string[];
  hash: string;
  idempotencyKey: string;
  actor: string;
  rollbackPlan: string;
}

function currentGitCommit(): string | null {
  try {
    return execSync("git rev-parse HEAD", { cwd: process.cwd(), encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/**
 * Gera o manifest — determinístico para o mesmo (script, destino, modo,
 * entidades, ids): rodar a mesma operação de novo produz o mesmo
 * idempotencyKey (não é um nonce aleatório).
 */
export function buildManifest(input: MigrationManifestInput): MigrationManifest {
  const timestamp = new Date().toISOString();
  const destinationDescription = describeDestination(input.destination);
  const actor = input.actor ?? os.userInfo().username;
  const idPayload = [...input.ids].sort().join(",");
  const hash = createHash("sha256").update(`${input.script}:${input.mode}:${input.entities}:${idPayload}`).digest("hex");
  const idempotencyKey = createHash("sha256")
    .update(`${input.script}:${destinationDescription}:${input.mode}:${input.entities}:${idPayload}`)
    .digest("hex")
    .slice(0, 32);
  return {
    timestamp,
    script: input.script,
    commit: currentGitCommit(),
    destination: destinationDescription,
    projectRef: input.destination.projectRef,
    mode: input.mode,
    entities: input.entities,
    quantity: input.quantity,
    ids: input.ids,
    hash,
    idempotencyKey,
    actor,
    rollbackPlan: input.rollbackPlan,
  };
}

/** Grava o manifest fora do git (diretório ignorado) — nunca contém secrets. */
export async function writeManifest(manifest: MigrationManifest): Promise<string> {
  const dir = path.join(process.cwd(), ".migration-manifests");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${manifest.timestamp.replace(/[:.]/g, "-")}-${manifest.script}.json`);
  await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return file;
}

export function printManifest(manifest: MigrationManifest): void {
  console.log("\n=== MANIFEST ===");
  console.log(JSON.stringify(manifest, null, 2));
  console.log("=== FIM DO MANIFEST ===\n");
}
