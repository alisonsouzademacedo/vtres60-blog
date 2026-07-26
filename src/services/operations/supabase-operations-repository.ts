import { randomUUID } from "node:crypto";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { legacyCompanyUuid, looksLikeLegacyCompanyId } from "./company-legacy-ids";
import type { IntelligenceItem, ManagedCompany, RadarSignal } from "@/types/operations";

/**
 * Fase 9B.1 — repositório Supabase para companies/radarSignals/intelligenceItems.
 * Mesmo padrão genérico já usado em src/services/editorial/editorial-repository.ts
 * (list/getOne/create/update/remove com mapper camelCase<->snake_case), reaproveitado
 * aqui em vez de inventado — ver auditoria no relatório da fase.
 */

type SupabaseCollection = "companies" | "radarSignals" | "intelligenceItems";
type RecordMap = { companies: ManagedCompany; radarSignals: RadarSignal; intelligenceItems: IntelligenceItem };

const now = () => new Date().toISOString();
const UNIQUE_VIOLATION = "23505";
const DUPLICATE_SLUG_ERROR = "Este slug já está em uso.";

const TABLES: Record<SupabaseCollection, string> = {
  companies: "companies",
  radarSignals: "radar_signals",
  intelligenceItems: "intelligence_items",
};

type FieldMap<T> = ReadonlyArray<readonly [keyof T & string, string]>;

function makeMapper<T>(fields: FieldMap<T>) {
  return {
    fromRow(row: Record<string, unknown>): T {
      const record = {} as T;
      for (const [key, column] of fields) {
        const value = row[column];
        if (value !== null) (record as Record<string, unknown>)[key] = value;
      }
      return record;
    },
    toRow(record: Partial<T>): Record<string, unknown> {
      const row: Record<string, unknown> = {};
      for (const [key, column] of fields) {
        if (key in record) row[column] = (record as Record<string, unknown>)[key];
      }
      return row;
    },
  };
}

const companyFields: FieldMap<ManagedCompany> = [
  ["id", "id"], ["name", "name"], ["slug", "slug"], ["legalName", "legal_name"], ["description", "description"],
  ["sector", "sector"], ["website", "website"], ["ticker", "ticker"], ["tickerSource", "ticker_source"],
  ["active", "active"], ["featured", "featured"], ["createdAt", "created_at"], ["updatedAt", "updated_at"],
];

const radarSignalFields: FieldMap<RadarSignal> = [
  ["id", "id"], ["title", "title"], ["summary", "summary"], ["evidencePostIds", "evidence_post_ids"],
  ["sourceUrls", "source_urls"], ["tagIds", "tag_ids"], ["segmentSlugs", "segment_slugs"],
  ["companySlugs", "company_slugs"], ["confidence", "confidence"], ["generatedAt", "generated_at"],
  ["validUntil", "valid_until"], ["status", "status"], ["reviewedAt", "reviewed_at"], ["publishedAt", "published_at"],
  ["createdAt", "created_at"], ["updatedAt", "updated_at"],
];

const intelligenceItemFields: FieldMap<IntelligenceItem> = [
  ["id", "id"], ["radarSignalId", "radar_signal_id"], ["kind", "kind"], ["title", "title"],
  ["analysis", "analysis"], ["recommendedAction", "recommended_action"], ["evidencePostIds", "evidence_post_ids"],
  ["sourceUrls", "source_urls"], ["segmentSlugs", "segment_slugs"], ["companySlugs", "company_slugs"],
  ["confidence", "confidence"], ["generatedAt", "generated_at"], ["validUntil", "valid_until"],
  ["status", "status"], ["reviewedAt", "reviewed_at"], ["publishedAt", "published_at"],
  ["createdAt", "created_at"], ["updatedAt", "updated_at"],
];

const mappers = {
  companies: makeMapper(companyFields),
  radarSignals: makeMapper(radarSignalFields),
  intelligenceItems: makeMapper(intelligenceItemFields),
} as const;

export const supabaseOperationsTables = TABLES;
export const supabaseOperationsMappers = mappers;

async function list<K extends SupabaseCollection>(collection: K): Promise<RecordMap[K][]> {
  noStore();
  const { data, error } = await supabaseAdmin.from(TABLES[collection]).select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const mapper = mappers[collection];
  return (data ?? []).map((row) => mapper.fromRow(row)) as RecordMap[K][];
}

// Postgres 22P02 = invalid_text_representation — lançado quando "value" não é
// um UUID sintaticamente válido (ex: um id legado "company-weg" contra uma
// coluna uuid). Não é "erro real", é "não encontrado por id" — precisa cair
// para a busca por slug/id legado abaixo, nunca lançar.
const INVALID_UUID_INPUT = "22P02";

async function getByIdOrSlug<K extends SupabaseCollection>(collection: K, value: string): Promise<RecordMap[K] | undefined> {
  noStore();
  const table = TABLES[collection];
  const mapper = mappers[collection];
  const byId = await supabaseAdmin.from(table).select("*").eq("id", value).maybeSingle();
  if (byId.error && byId.error.code !== INVALID_UUID_INPUT) throw new Error(byId.error.message);
  if (byId.data) return mapper.fromRow(byId.data) as RecordMap[K];
  // Só "companies" tem coluna slug (radar_signals/intelligence_items não têm — ver schema).
  if (collection === "companies") {
    const bySlug = await supabaseAdmin.from(table).select("*").eq("slug", value).maybeSingle();
    if (bySlug.error) throw new Error(bySlug.error.message);
    if (bySlug.data) return mapper.fromRow(bySlug.data) as RecordMap[K];
  }
  // Compatibilidade com URLs administrativas antigas (/admin/empresas/company-weg):
  // resolve o id legado para o UUID determinístico correspondente antes de desistir.
  // Não é uma segunda fonte de verdade — é a mesma função pura usada na migração.
  // Pode ser removida quando não houver mais risco de link/bookmark antigo em uso
  // (ver docs/implementacao-fase9b1-supabase-dominios.md).
  if (collection === "companies" && looksLikeLegacyCompanyId(value)) {
    const resolved = await supabaseAdmin.from(table).select("*").eq("id", legacyCompanyUuid(value)).maybeSingle();
    if (resolved.error) throw new Error(resolved.error.message);
    if (resolved.data) return mapper.fromRow(resolved.data) as RecordMap[K];
  }
  return undefined;
}

async function createRecord<K extends SupabaseCollection>(
  collection: K,
  input: Omit<RecordMap[K], "id" | "createdAt" | "updatedAt">,
): Promise<RecordMap[K]> {
  const timestamp = now();
  const record = { ...input, id: randomUUID(), createdAt: timestamp, updatedAt: timestamp } as RecordMap[K];
  const row = mappers[collection].toRow(record);
  const { data, error } = await supabaseAdmin.from(TABLES[collection]).insert(row).select().single();
  if (error) throw new Error(error.code === UNIQUE_VIOLATION ? DUPLICATE_SLUG_ERROR : error.message);
  return mappers[collection].fromRow(data) as RecordMap[K];
}

async function updateRecord<K extends SupabaseCollection>(
  collection: K,
  id: string,
  patch: Partial<RecordMap[K]>,
): Promise<RecordMap[K] | undefined> {
  const rest = { ...(patch as Record<string, unknown>) };
  delete rest.id;
  delete rest.createdAt;
  const row = mappers[collection].toRow({ ...rest, updatedAt: now() } as Partial<RecordMap[K]>);
  const { data, error } = await supabaseAdmin.from(TABLES[collection]).update(row).eq("id", id).select().maybeSingle();
  if (error) throw new Error(error.code === UNIQUE_VIOLATION ? DUPLICATE_SLUG_ERROR : error.message);
  return data ? (mappers[collection].fromRow(data) as RecordMap[K]) : undefined;
}

async function removeRecord<K extends SupabaseCollection>(collection: K, id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from(TABLES[collection]).delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

function expireIfPast<T extends { status: string; validUntil: string }>(item: T): T {
  return item.status === "published" && new Date(item.validUntil).getTime() < Date.now() ? { ...item, status: "expired" } : item;
}

async function sweepExpiry<K extends "radarSignals" | "intelligenceItems">(collection: K): Promise<RecordMap[K][]> {
  const items = await list(collection);
  const expired = items.filter((item) => {
    const typed = item as unknown as { status: string; validUntil: string };
    return typed.status === "published" && new Date(typed.validUntil).getTime() < Date.now();
  });
  if (expired.length) {
    const ids = expired.map((item) => (item as unknown as { id: string }).id);
    const { error } = await supabaseAdmin.from(TABLES[collection]).update({ status: "expired", updated_at: now() }).in("id", ids);
    if (error) throw new Error(error.message);
  }
  return items.map((item) => expireIfPast(item as unknown as { status: string; validUntil: string })) as RecordMap[K][];
}

export const supabaseOperationsRepository = {
  listCompanies: () => list("companies"),
  getCompany: (value: string) => getByIdOrSlug("companies", value),
  createCompany: (input: Omit<ManagedCompany, "id" | "createdAt" | "updatedAt">) => createRecord("companies", input),
  updateCompany: (id: string, patch: Partial<ManagedCompany>) => updateRecord("companies", id, patch),
  deleteCompany: (id: string) => removeRecord("companies", id),

  listRadarSignals: () => sweepExpiry("radarSignals"),
  getRadarSignal: async (value: string) => {
    const swept = await sweepExpiry("radarSignals");
    return swept.find((item) => item.id === value) ?? getByIdOrSlug("radarSignals", value);
  },
  createRadarSignal: (input: Omit<RadarSignal, "id" | "createdAt" | "updatedAt">) => createRecord("radarSignals", input),
  updateRadarSignal: (id: string, patch: Partial<RadarSignal>) => updateRecord("radarSignals", id, patch),
  deleteRadarSignal: (id: string) => removeRecord("radarSignals", id),

  listIntelligenceItems: () => sweepExpiry("intelligenceItems"),
  getIntelligenceItem: async (value: string) => {
    const swept = await sweepExpiry("intelligenceItems");
    return swept.find((item) => item.id === value) ?? getByIdOrSlug("intelligenceItems", value);
  },
  createIntelligenceItem: (input: Omit<IntelligenceItem, "id" | "createdAt" | "updatedAt">) => createRecord("intelligenceItems", input),
  updateIntelligenceItem: (id: string, patch: Partial<IntelligenceItem>) => updateRecord("intelligenceItems", id, patch),
  deleteIntelligenceItem: (id: string) => removeRecord("intelligenceItems", id),
};
