import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EnvDestinationConflictError,
  ProductionGuardError,
  assertSafeToWrite,
  buildManifest,
  describeDestination,
  loadEnvSafely,
  resolveDestination,
  writeManifest,
  type ResolvedDestination,
} from "./safe-target";

const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;
let envBackup: Partial<Record<(typeof ENV_KEYS)[number], string>>;
let tempDir: string;
let envFile: string;

beforeEach(async () => {
  envBackup = {};
  for (const key of ENV_KEYS) {
    envBackup[key] = process.env[key];
    delete process.env[key];
  }
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "safe-target-test-"));
  envFile = path.join(tempDir, ".env.local");
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    if (envBackup[key] === undefined) delete process.env[key];
    else process.env[key] = envBackup[key];
  }
  delete process.env.SAFE_TARGET_ENV_LABEL;
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function withCwd<T>(dir: string, fn: () => T | Promise<T>): Promise<T> {
  const original = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(original);
  }
}

describe("loadEnvSafely", () => {
  it("carrega valores do arquivo quando nada está definido no processo (cenário local válido)", async () => {
    await fs.writeFile(envFile, "NEXT_PUBLIC_SUPABASE_URL=http://localhost:55495\n");
    await withCwd(tempDir, () => loadEnvSafely());
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://localhost:55495");
  });

  it("nunca sobrescreve uma variável já presente explicitamente no processo (override proibido)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:55495";
    await fs.writeFile(envFile, "NEXT_PUBLIC_SUPABASE_URL=http://localhost:55495\n");
    await withCwd(tempDir, () => loadEnvSafely());
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://localhost:55495");
  });

  it("rejeita (ENV_DESTINATION_CONFLICT) quando processo e arquivo divergem para a mesma chave — nunca escolhe sozinho", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:55495";
    await fs.writeFile(envFile, "NEXT_PUBLIC_SUPABASE_URL=https://fdsojpwznvephwdoghbn.supabase.co\n");
    await expect(withCwd(tempDir, () => loadEnvSafely())).rejects.toBeInstanceOf(EnvDestinationConflictError);
  });

  it("o erro de conflito lista apenas os NOMES das variáveis, nunca os valores", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "valor-explicito-secreto";
    await fs.writeFile(envFile, "SUPABASE_SERVICE_ROLE_KEY=valor-do-arquivo-secreto\n");
    try {
      await withCwd(tempDir, () => loadEnvSafely());
      expect.unreachable("deveria ter lançado EnvDestinationConflictError");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvDestinationConflictError);
      const message = (error as Error).message;
      expect(message).not.toContain("valor-explicito-secreto");
      expect(message).not.toContain("valor-do-arquivo-secreto");
      expect((error as EnvDestinationConflictError).conflictingKeys).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
    }
  });

  it("não conflita quando processo e arquivo têm o MESMO valor", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:55495";
    await fs.writeFile(envFile, "NEXT_PUBLIC_SUPABASE_URL=http://localhost:55495\n");
    await expect(withCwd(tempDir, () => loadEnvSafely())).resolves.toBeUndefined();
  });
});

describe("resolveDestination", () => {
  it("identifica LOCAL (execução local válida)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:55495";
    expect(resolveDestination()).toEqual({ kind: "LOCAL", hostname: "localhost", port: "55495", projectRef: null });
  });

  it("identifica PRODUCTION para o project ref real confirmado", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fdsojpwznvephwdoghbn.supabase.co";
    const destination = resolveDestination();
    expect(destination.kind).toBe("PRODUCTION");
    expect(destination.projectRef).toBe("fdsojpwznvephwdoghbn");
  });

  it("identifica UNKNOWN para um project ref diferente do de produção (destino desconhecido)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://outroprojetodiferente.supabase.co";
    const destination = resolveDestination();
    expect(destination.kind).toBe("UNKNOWN");
    expect(destination.projectRef).toBe("outroprojetodiferente");
  });

  it("identifica UNKNOWN quando a variável não está definida", () => {
    expect(resolveDestination().kind).toBe("UNKNOWN");
  });

  it("identifica UNKNOWN para uma URL malformada", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "isso-nao-e-uma-url";
    expect(resolveDestination().kind).toBe("UNKNOWN");
  });

  it("nunca INFERE TEST a partir só do hostname — permanece UNKNOWN sem o rótulo explícito (execução de teste válida exige declaração explícita, não dedução)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://algumprojetoteste.supabase.co";
    expect(resolveDestination().kind).toBe("UNKNOWN");
  });

  it("identifica TEST somente quando SAFE_TARGET_ENV_LABEL=TEST é declarado explicitamente (execução de teste válida)", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://algumprojetoteste.supabase.co";
    process.env.SAFE_TARGET_ENV_LABEL = "TEST";
    expect(resolveDestination().kind).toBe("TEST");
    delete process.env.SAFE_TARGET_ENV_LABEL;
  });

  it("identifica STAGING somente quando SAFE_TARGET_ENV_LABEL=STAGING é declarado explicitamente", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://algumprojetostaging.supabase.co";
    process.env.SAFE_TARGET_ENV_LABEL = "STAGING";
    expect(resolveDestination().kind).toBe("STAGING");
    delete process.env.SAFE_TARGET_ENV_LABEL;
  });

  it("SAFE_TARGET_ENV_LABEL nunca reclassifica o project ref real de produção — produção continua PRODUCTION mesmo com o rótulo setado por engano", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fdsojpwznvephwdoghbn.supabase.co";
    process.env.SAFE_TARGET_ENV_LABEL = "TEST";
    expect(resolveDestination().kind).toBe("PRODUCTION");
    delete process.env.SAFE_TARGET_ENV_LABEL;
  });
});

describe("describeDestination — secrets nunca aparecem", () => {
  it("nunca inclui service role key, senha, token ou connection string", () => {
    const destination: ResolvedDestination = { kind: "PRODUCTION", hostname: "fdsojpwznvephwdoghbn.supabase.co", port: "443", projectRef: "fdsojpwznvephwdoghbn" };
    const described = describeDestination(destination);
    expect(described).not.toMatch(/eyJ|postgres:\/\/|sk-|service_role/i);
  });
});

describe("assertSafeToWrite", () => {
  const productionDestination: ResolvedDestination = { kind: "PRODUCTION", hostname: "fdsojpwznvephwdoghbn.supabase.co", port: "443", projectRef: "fdsojpwznvephwdoghbn" };
  const localDestination: ResolvedDestination = { kind: "LOCAL", hostname: "localhost", port: "55495", projectRef: null };
  const unknownDestination: ResolvedDestination = { kind: "UNKNOWN", hostname: "outro.supabase.co", port: "443", projectRef: "outro" };
  const fullOptions = { allowProduction: true, apply: true, dryRun: false, manifestGenerated: true, idempotencyKey: "abc123", actor: "pedro" };

  it("bloqueia (FAIL_CLOSED) quando o destino é UNKNOWN, mesmo com todas as flags", () => {
    expect(() => assertSafeToWrite(unknownDestination, fullOptions)).toThrow(ProductionGuardError);
  });

  it("permite execução local válida independente das flags de produção", () => {
    expect(() => assertSafeToWrite(localDestination, { allowProduction: false, apply: false, dryRun: true, manifestGenerated: false, idempotencyKey: null, actor: null })).not.toThrow();
  });

  it("permite execução de teste válida (kind=TEST, declarado explicitamente) independente das flags de produção", () => {
    const testDestination: ResolvedDestination = { kind: "TEST", hostname: "algumprojetoteste.supabase.co", port: "443", projectRef: "algumprojetoteste" };
    expect(() => assertSafeToWrite(testDestination, { allowProduction: false, apply: false, dryRun: true, manifestGenerated: false, idempotencyKey: null, actor: null })).not.toThrow();
  });

  it("bloqueia produção sem --allow-production", () => {
    expect(() => assertSafeToWrite(productionDestination, { ...fullOptions, allowProduction: false })).toThrow(/allow-production/);
  });

  it("bloqueia produção sem --apply", () => {
    expect(() => assertSafeToWrite(productionDestination, { ...fullOptions, apply: false })).toThrow(/apply/);
  });

  it("bloqueia produção com project ref incorreto", () => {
    const wrongRef: ResolvedDestination = { ...productionDestination, projectRef: "ref-errado" };
    expect(() => assertSafeToWrite(wrongRef, fullOptions)).toThrow(/project ref/);
  });

  it("bloqueia produção com dry-run ativo", () => {
    expect(() => assertSafeToWrite(productionDestination, { ...fullOptions, dryRun: true })).toThrow(/dry-run/);
  });

  it("bloqueia produção sem manifest", () => {
    expect(() => assertSafeToWrite(productionDestination, { ...fullOptions, manifestGenerated: false })).toThrow(/manifest/);
  });

  it("bloqueia produção sem idempotency key", () => {
    expect(() => assertSafeToWrite(productionDestination, { ...fullOptions, idempotencyKey: null })).toThrow(/idempotency/);
  });

  it("bloqueia produção sem ator registrado", () => {
    expect(() => assertSafeToWrite(productionDestination, { ...fullOptions, actor: null })).toThrow(/ator/);
  });

  it("permite produção quando TODOS os requisitos estão presentes simultaneamente", () => {
    expect(() => assertSafeToWrite(productionDestination, fullOptions)).not.toThrow();
  });
});

describe("buildManifest — idempotência e rastreabilidade", () => {
  const destination: ResolvedDestination = { kind: "LOCAL", hostname: "localhost", port: "55495", projectRef: null };

  it("gera o mesmo idempotencyKey para a mesma operação (script/destino/modo/entidades/ids) — segunda execução não duplica", () => {
    const first = buildManifest({ script: "migrate-operations-to-supabase.ts", destination, mode: "apply", entities: "companies", quantity: 6, ids: ["a", "b"], rollbackPlan: "delete by id" });
    const second = buildManifest({ script: "migrate-operations-to-supabase.ts", destination, mode: "apply", entities: "companies", quantity: 6, ids: ["a", "b"], rollbackPlan: "delete by id" });
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });

  it("gera idempotencyKey diferente quando os ids mudam", () => {
    const first = buildManifest({ script: "x", destination, mode: "apply", entities: "companies", quantity: 1, ids: ["a"], rollbackPlan: "r" });
    const second = buildManifest({ script: "x", destination, mode: "apply", entities: "companies", quantity: 1, ids: ["b"], rollbackPlan: "r" });
    expect(first.idempotencyKey).not.toBe(second.idempotencyKey);
  });

  it("inclui um plano de rollback (rollback preview)", () => {
    const manifest = buildManifest({ script: "x", destination, mode: "apply", entities: "companies", quantity: 1, ids: ["a"], rollbackPlan: "delete where id in (...)" });
    expect(manifest.rollbackPlan).toBe("delete where id in (...)");
  });

  it("nunca inclui secrets no manifest", () => {
    const manifest = buildManifest({ script: "x", destination, mode: "apply", entities: "companies", quantity: 1, ids: ["a"], rollbackPlan: "r" });
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toMatch(/eyJ|postgres:\/\/|sk-|service_role_key/i);
  });

  it("registra um ator mesmo sem ser informado explicitamente (usa o usuário do SO)", () => {
    const manifest = buildManifest({ script: "x", destination, mode: "apply", entities: "companies", quantity: 1, ids: ["a"], rollbackPlan: "r" });
    expect(manifest.actor).toBeTruthy();
  });
});

describe("writeManifest", () => {
  it("grava o manifest em disco fora do controle de versão", async () => {
    const destination: ResolvedDestination = { kind: "LOCAL", hostname: "localhost", port: "55495", projectRef: null };
    const manifest = buildManifest({ script: "test-script", destination, mode: "dry-run", entities: "companies", quantity: 0, ids: [], rollbackPlan: "n/a" });
    const filePath = await withCwd(tempDir, () => writeManifest(manifest));
    const content = await fs.readFile(filePath, "utf8");
    expect(JSON.parse(content).script).toBe("test-script");
  });
});
