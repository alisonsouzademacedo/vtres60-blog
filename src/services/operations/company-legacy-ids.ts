import { uuidV5 } from "@/lib/uuid-v5";

/**
 * Fase 9B.1 — mapeamento determinístico entre os ids legados de
 * companies.json (formato "company-<slug>", herdado do seed da Fase 8D) e
 * UUIDs reais, exigido pela coluna companies.id (uuid, já aplicada em
 * produção na Fase 8E — ver decisão registrada em
 * docs/implementacao-fase9b1-supabase-dominios.md, seção "Decisão: ids de
 * companies").
 *
 * UUID v5 (RFC 4122): mesmo id legado sempre produz o mesmo UUID, em
 * qualquer execução, para sempre. Nenhuma tabela auxiliar é necessária — a
 * função é a própria fonte da verdade da conversão.
 *
 * O namespace abaixo é arbitrário (gerado uma única vez via
 * `crypto.randomUUID()`, 2026-07-24) mas fixo — nunca deve mudar depois de
 * publicado, ou os UUIDs gerados deixam de bater com os já migrados.
 */
export const VTRES60_COMPANIES_NAMESPACE = "ce6a5120-b110-43c5-bf91-3ec9adc0f69a";

export function legacyCompanyUuid(legacyId: string): string {
  return uuidV5(legacyId, VTRES60_COMPANIES_NAMESPACE);
}

/**
 * Os 6 ids legados reais conhecidos em companies.json no momento da Fase
 * 9B.1 (confirmados por leitura direta do arquivo, não por dedução) — só
 * para documentação/testes de regressão. A função `legacyCompanyUuid` acima
 * é a única fonte operante; esta lista não precisa ser mantida se novas
 * empresas forem criadas (essas já nascem com UUID real via `randomUUID()`,
 * nunca com id legado "company-*").
 */
export const KNOWN_LEGACY_COMPANY_IDS = [
  "company-weg",
  "company-gerdau",
  "company-marcopolo",
  "company-randon",
  "company-john-deere",
  "company-tramontina",
] as const;

/** true só para o formato legado real conhecido ("company-<slug>"), nunca para um UUID real. */
export function looksLikeLegacyCompanyId(value: string): boolean {
  return /^company-[a-z0-9-]+$/.test(value) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}
