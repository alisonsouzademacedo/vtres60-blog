import { supabaseAdmin } from "@/lib/supabase";
import type { UsageProvider } from "./usage-repository";

// Fase 7 (Secao 14/15/16) — CRUD server-side (supabaseAdmin, service_role)
// para as 3 tabelas de configuracao financeira administravel criadas em
// supabase-cost-settings-schema.sql. Nunca acessado pelo client direto —
// so via rotas /api/admin/costs/*.

export interface ManualPriceEntry {
  id: string;
  provider: UsageProvider;
  model: string;
  unit: string;
  inputCost: number | undefined;
  outputCost: number | undefined;
  imageComputeCost: number | undefined;
  currency: string;
  effectiveFrom: string | undefined;
  note: string | undefined;
  source: string | undefined;
  active: boolean;
}

export interface ManualPriceInput {
  provider: UsageProvider;
  model: string;
  unit: string;
  inputCost?: number;
  outputCost?: number;
  imageComputeCost?: number;
  currency?: string;
  effectiveFrom?: string;
  note?: string;
  source?: string;
  active?: boolean;
}

function fromManualPriceRow(row: {
  id: string;
  provider: UsageProvider;
  model: string;
  unit: string;
  input_cost: number | null;
  output_cost: number | null;
  image_compute_cost: number | null;
  currency: string;
  effective_from: string | null;
  note: string | null;
  source: string | null;
  active: boolean;
}): ManualPriceEntry {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    unit: row.unit,
    inputCost: row.input_cost ?? undefined,
    outputCost: row.output_cost ?? undefined,
    imageComputeCost: row.image_compute_cost ?? undefined,
    currency: row.currency,
    effectiveFrom: row.effective_from ?? undefined,
    note: row.note ?? undefined,
    source: row.source ?? undefined,
    active: row.active,
  };
}

export async function listManualPrices(): Promise<ManualPriceEntry[]> {
  const { data, error } = await supabaseAdmin.from("provider_cost_settings").select("*").order("provider").order("model");
  if (error) throw new Error(error.message);
  return (data ?? []).map(fromManualPriceRow);
}

export async function upsertManualPrice(input: ManualPriceInput): Promise<ManualPriceEntry> {
  const { data, error } = await supabaseAdmin
    .from("provider_cost_settings")
    .upsert(
      {
        provider: input.provider,
        model: input.model,
        unit: input.unit,
        input_cost: input.inputCost ?? null,
        output_cost: input.outputCost ?? null,
        image_compute_cost: input.imageComputeCost ?? null,
        currency: input.currency ?? "USD",
        effective_from: input.effectiveFrom ?? null,
        note: input.note ?? null,
        source: input.source ?? null,
        active: input.active ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,model,unit" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return fromManualPriceRow(data);
}

export interface BudgetEntry {
  id: string;
  provider: UsageProvider;
  currency: string;
  initialValue: number;
  initialDate: string;
  note: string | undefined;
  active: boolean;
}

export interface BudgetInput {
  provider: UsageProvider;
  currency?: string;
  initialValue: number;
  initialDate: string;
  note?: string;
  active?: boolean;
}

function fromBudgetRow(row: {
  id: string;
  provider: UsageProvider;
  currency: string;
  initial_value: number;
  initial_date: string;
  note: string | null;
  active: boolean;
}): BudgetEntry {
  return {
    id: row.id,
    provider: row.provider,
    currency: row.currency,
    initialValue: row.initial_value,
    initialDate: row.initial_date,
    note: row.note ?? undefined,
    active: row.active,
  };
}

export async function listActiveBudgets(): Promise<BudgetEntry[]> {
  const { data, error } = await supabaseAdmin.from("provider_budget_settings").select("*").eq("active", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map(fromBudgetRow);
}

export async function createBudget(input: BudgetInput): Promise<BudgetEntry> {
  const { data, error } = await supabaseAdmin
    .from("provider_budget_settings")
    .insert({
      provider: input.provider,
      currency: input.currency ?? "USD",
      initial_value: input.initialValue,
      initial_date: input.initialDate,
      note: input.note ?? null,
      active: input.active ?? true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return fromBudgetRow(data);
}

export interface CurrencyRateEntry {
  id: string;
  currencyFrom: string;
  currencyTo: string;
  rate: number;
  rateDate: string;
  note: string | undefined;
}

export interface CurrencyRateInput {
  currencyFrom: string;
  currencyTo?: string;
  rate: number;
  rateDate: string;
  note?: string;
}

function fromCurrencyRateRow(row: {
  id: string;
  currency_from: string;
  currency_to: string;
  rate: number;
  rate_date: string;
  note: string | null;
}): CurrencyRateEntry {
  return {
    id: row.id,
    currencyFrom: row.currency_from,
    currencyTo: row.currency_to,
    rate: row.rate,
    rateDate: row.rate_date,
    note: row.note ?? undefined,
  };
}

/** Taxa mais recente por par de moedas — usada para a conversao exibida no painel. */
export async function latestCurrencyRate(currencyFrom: string, currencyTo = "BRL"): Promise<CurrencyRateEntry | undefined> {
  const { data, error } = await supabaseAdmin
    .from("currency_rates")
    .select("*")
    .eq("currency_from", currencyFrom)
    .eq("currency_to", currencyTo)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromCurrencyRateRow(data) : undefined;
}

export async function createCurrencyRate(input: CurrencyRateInput): Promise<CurrencyRateEntry> {
  const { data, error } = await supabaseAdmin
    .from("currency_rates")
    .insert({
      currency_from: input.currencyFrom,
      currency_to: input.currencyTo ?? "BRL",
      rate: input.rate,
      rate_date: input.rateDate,
      note: input.note ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return fromCurrencyRateRow(data);
}
