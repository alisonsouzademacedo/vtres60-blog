"use client";
import { useState } from "react";
import { withBasePath } from "@/lib/paths";
import type { ManualPriceEntry, BudgetEntry, CurrencyRateEntry } from "@/lib/agent/costs/cost-settings-repository";
import type { UsageProvider } from "@/lib/agent/costs/usage-repository";

const PROVIDER_LABELS: Record<UsageProvider, string> = {
  openai: "OpenAI",
  gnews: "GNews",
  replicate: "Replicate",
  pexels: "Pexels",
  supabase: "Supabase",
};
const PROVIDERS = Object.keys(PROVIDER_LABELS) as UsageProvider[];
const UNITS: { value: string; label: string }[] = [
  { value: "per_1k_input_tokens", label: "por 1k tokens de entrada" },
  { value: "per_1k_output_tokens", label: "por 1k tokens de saída" },
  { value: "per_1k_cached_input_tokens", label: "por 1k tokens de entrada (cache)" },
  { value: "per_image", label: "por imagem" },
  { value: "flat_free", label: "gratuito / sem custo por chamada" },
];

type Status = "idle" | "saving" | "success" | "error";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(withBasePath(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Falha ao salvar");
  return data as T;
}

export function CostSettingsForm({
  initialPrices,
  initialBudgets,
  initialCurrencyRates,
}: {
  initialPrices: ManualPriceEntry[];
  initialBudgets: BudgetEntry[];
  initialCurrencyRates: CurrencyRateEntry[];
}) {
  return (
    <div className="admin-form">
      <ManualPricesSection initial={initialPrices} />
      <BudgetsSection initial={initialBudgets} />
      <CurrencyRatesSection initial={initialCurrencyRates} />
    </div>
  );
}

function StatusLine({ status, message }: { status: Status; message: string }) {
  if (status === "idle") return null;
  return (
    <p className="admin-help" data-error={status === "error" ? "true" : undefined}>
      {message}
    </p>
  );
}

function ManualPricesSection({ initial }: { initial: ManualPriceEntry[] }) {
  const [rows, setRows] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    provider: "openai" as UsageProvider,
    model: "",
    unit: UNITS[0].value,
    inputCost: "",
    outputCost: "",
    imageComputeCost: "",
    currency: "USD",
    effectiveFrom: "",
    note: "",
    source: "",
  });

  async function submit() {
    if (!form.model.trim()) {
      setStatus("error");
      setMessage("Informe o modelo.");
      return;
    }
    setStatus("saving");
    setMessage("Salvando...");
    try {
      const saved = await postJson<ManualPriceEntry>("/api/admin/costs/prices", {
        provider: form.provider,
        model: form.model.trim(),
        unit: form.unit,
        inputCost: form.inputCost ? Number(form.inputCost) : undefined,
        outputCost: form.outputCost ? Number(form.outputCost) : undefined,
        imageComputeCost: form.imageComputeCost ? Number(form.imageComputeCost) : undefined,
        currency: form.currency || "USD",
        effectiveFrom: form.effectiveFrom || undefined,
        note: form.note || undefined,
        source: form.source || undefined,
        active: true,
      });
      setRows((prev) => [saved, ...prev.filter((row) => row.id !== saved.id)]);
      setStatus("success");
      setMessage(`Preço manual salvo para ${saved.provider}/${saved.model}.`);
      setForm({ ...form, model: "", inputCost: "", outputCost: "", imageComputeCost: "", note: "", source: "" });
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Falha ao salvar");
    }
  }

  return (
    <details className="admin-section" open>
      <summary>Preços manuais</summary>
      <div className="admin-section-body">
        <p className="admin-help">
          Usado quando não há preço OFFICIAL_VERIFIED confirmado ao vivo (ver painel Custos e APIs) — nunca
          sobrescreve um preço oficial verificado, só entra na precedência abaixo dele.
        </p>
        <div className="admin-fields">
          <div className="admin-field">
            <label>Provider</label>
            <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value as UsageProvider })}>
              {PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {PROVIDER_LABELS[provider]}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label>Modelo</label>
            <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="gpt-4o, sdxl, ..." />
          </div>
          <div className="admin-field">
            <label>Unidade</label>
            <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label>Custo — entrada</label>
            <input type="number" step="0.0001" min="0" value={form.inputCost} onChange={(e) => setForm({ ...form, inputCost: e.target.value })} />
          </div>
          <div className="admin-field">
            <label>Custo — saída</label>
            <input type="number" step="0.0001" min="0" value={form.outputCost} onChange={(e) => setForm({ ...form, outputCost: e.target.value })} />
          </div>
          <div className="admin-field">
            <label>Custo — imagem</label>
            <input type="number" step="0.0001" min="0" value={form.imageComputeCost} onChange={(e) => setForm({ ...form, imageComputeCost: e.target.value })} />
          </div>
          <div className="admin-field">
            <label>Moeda</label>
            <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="USD" />
          </div>
          <div className="admin-field">
            <label>Vigente desde</label>
            <input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
          </div>
          <div className="admin-field">
            <label>Fonte</label>
            <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="URL da documentação, se houver" />
          </div>
          <div className="admin-field admin-field-full">
            <label>Nota</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Origem do valor, contexto, data de checagem manual..." />
          </div>
        </div>
        <div className="admin-savebar">
          <StatusLine status={status} message={message} />
          <button className="admin-primary-button" type="button" onClick={submit} disabled={status === "saving"}>
            {status === "saving" ? "Salvando..." : "Salvar preço manual"}
          </button>
        </div>
        <div className="admin-table">
          <div className="admin-table-head">
            <span>Provider / modelo</span>
            <span>Unidade</span>
            <span>Custo</span>
            <span>Vigente desde</span>
          </div>
          {rows.map((row) => (
            <article className="admin-table-row" key={row.id}>
              <div className="admin-table-title">
                <b>
                  {PROVIDER_LABELS[row.provider]} · {row.model}
                </b>
                {row.note && <small>{row.note}</small>}
              </div>
              <span className="admin-table-meta">{UNITS.find((u) => u.value === row.unit)?.label ?? row.unit}</span>
              <span className="admin-table-meta">
                {row.currency} {(row.inputCost ?? row.outputCost ?? row.imageComputeCost ?? 0).toFixed(4)}
              </span>
              <span className="admin-table-meta">{row.effectiveFrom ?? "—"}</span>
            </article>
          ))}
          {rows.length === 0 && (
            <div className="admin-empty">
              <h2>Nenhum preço manual cadastrado</h2>
              <p>Enquanto não houver cadastro, o estado MANUAL não é usado na resolução de preço (ver resolve-price.ts).</p>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

function BudgetsSection({ initial }: { initial: BudgetEntry[] }) {
  const [rows, setRows] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    provider: "openai" as UsageProvider,
    currency: "USD",
    initialValue: "",
    initialDate: "",
    note: "",
  });

  async function submit() {
    const value = Number(form.initialValue);
    if (!form.initialValue || !Number.isFinite(value) || !form.initialDate) {
      setStatus("error");
      setMessage("Informe orçamento/crédito inicial (número) e a data de referência.");
      return;
    }
    setStatus("saving");
    setMessage("Salvando...");
    try {
      const saved = await postJson<BudgetEntry>("/api/admin/costs/budgets", {
        provider: form.provider,
        currency: form.currency || "USD",
        initialValue: value,
        initialDate: form.initialDate,
        note: form.note || undefined,
        active: true,
      });
      setRows((prev) => [saved, ...prev.filter((row) => row.id !== saved.id)]);
      setStatus("success");
      setMessage(`Orçamento cadastrado para ${saved.provider}.`);
      setForm({ ...form, initialValue: "", note: "" });
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Falha ao salvar");
    }
  }

  return (
    <details className="admin-section" open>
      <summary>Orçamento / crédito inicial (Saldo estimado)</summary>
      <div className="admin-section-body">
        <p className="admin-help">
          Nenhum provider usado por este pipeline expõe saldo real pela chave configurada — o orçamento inicial
          cadastrado aqui, menos o consumo calculado desde a data de referência, é sempre apresentado como
          &quot;estimado&quot;, nunca &quot;oficial&quot;.
        </p>
        <div className="admin-fields">
          <div className="admin-field">
            <label>Provider</label>
            <select value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value as UsageProvider })}>
              {PROVIDERS.map((provider) => (
                <option key={provider} value={provider}>
                  {PROVIDER_LABELS[provider]}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label>Moeda</label>
            <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="USD" />
          </div>
          <div className="admin-field">
            <label>Orçamento / crédito inicial</label>
            <input type="number" step="0.01" min="0" value={form.initialValue} onChange={(e) => setForm({ ...form, initialValue: e.target.value })} />
          </div>
          <div className="admin-field">
            <label>Data de referência</label>
            <input type="date" value={form.initialDate} onChange={(e) => setForm({ ...form, initialDate: e.target.value })} />
          </div>
          <div className="admin-field admin-field-full">
            <label>Nota</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Nº da fatura, plano contratado, etc." />
          </div>
        </div>
        <div className="admin-savebar">
          <StatusLine status={status} message={message} />
          <button className="admin-primary-button" type="button" onClick={submit} disabled={status === "saving"}>
            {status === "saving" ? "Salvando..." : "Salvar orçamento"}
          </button>
        </div>
        <div className="admin-table">
          <div className="admin-table-head">
            <span>Provider</span>
            <span>Inicial</span>
            <span>Desde</span>
          </div>
          {rows.map((row) => (
            <article className="admin-table-row" key={row.id}>
              <div className="admin-table-title">
                <b>{PROVIDER_LABELS[row.provider]}</b>
                {row.note && <small>{row.note}</small>}
              </div>
              <span className="admin-table-meta">
                {row.currency} {row.initialValue.toFixed(2)}
              </span>
              <span className="admin-table-meta">{row.initialDate}</span>
            </article>
          ))}
          {rows.length === 0 && (
            <div className="admin-empty">
              <h2>Nenhum orçamento cadastrado</h2>
              <p>Sem orçamento ativo, o painel Custos e APIs não calcula Saldo estimado para nenhum provider.</p>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}

function CurrencyRatesSection({ initial }: { initial: CurrencyRateEntry[] }) {
  const [rows, setRows] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ currencyFrom: "USD", currencyTo: "BRL", rate: "", rateDate: "", note: "" });

  async function submit() {
    const rate = Number(form.rate);
    if (!form.rate || !Number.isFinite(rate) || rate <= 0 || !form.rateDate) {
      setStatus("error");
      setMessage("Informe a taxa (número positivo) e a data da cotação.");
      return;
    }
    setStatus("saving");
    setMessage("Salvando...");
    try {
      const saved = await postJson<CurrencyRateEntry>("/api/admin/costs/currency-rates", {
        currencyFrom: form.currencyFrom || "USD",
        currencyTo: form.currencyTo || "BRL",
        rate,
        rateDate: form.rateDate,
        note: form.note || undefined,
      });
      setRows((prev) => [saved, ...prev.filter((row) => row.id !== saved.id)]);
      setStatus("success");
      setMessage(`Taxa cadastrada: 1 ${saved.currencyFrom} = ${saved.rate} ${saved.currencyTo}.`);
      setForm({ ...form, rate: "", note: "" });
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Falha ao salvar");
    }
  }

  return (
    <details className="admin-section">
      <summary>Câmbio manual</summary>
      <div className="admin-section-body">
        <p className="admin-help">
          Sem provider externo de câmbio: a conversão para BRL exibida no painel só existe se houver uma taxa
          cadastrada aqui. Sem taxa, o valor original nunca é ocultado nem uma taxa é inventada.
        </p>
        <div className="admin-fields">
          <div className="admin-field">
            <label>De (moeda)</label>
            <input value={form.currencyFrom} onChange={(e) => setForm({ ...form, currencyFrom: e.target.value.toUpperCase() })} placeholder="USD" />
          </div>
          <div className="admin-field">
            <label>Para (moeda)</label>
            <input value={form.currencyTo} onChange={(e) => setForm({ ...form, currencyTo: e.target.value.toUpperCase() })} placeholder="BRL" />
          </div>
          <div className="admin-field">
            <label>Taxa</label>
            <input type="number" step="0.0001" min="0" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
          </div>
          <div className="admin-field">
            <label>Data da cotação</label>
            <input type="date" value={form.rateDate} onChange={(e) => setForm({ ...form, rateDate: e.target.value })} />
          </div>
          <div className="admin-field admin-field-full">
            <label>Nota</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Fonte da cotação (Banco Central, etc.)" />
          </div>
        </div>
        <div className="admin-savebar">
          <StatusLine status={status} message={message} />
          <button className="admin-primary-button" type="button" onClick={submit} disabled={status === "saving"}>
            {status === "saving" ? "Salvando..." : "Salvar taxa"}
          </button>
        </div>
        <div className="admin-table">
          <div className="admin-table-head">
            <span>Par</span>
            <span>Taxa</span>
            <span>Data</span>
          </div>
          {rows.map((row) => (
            <article className="admin-table-row" key={row.id}>
              <div className="admin-table-title">
                <b>
                  {row.currencyFrom} → {row.currencyTo}
                </b>
                {row.note && <small>{row.note}</small>}
              </div>
              <span className="admin-table-meta">{row.rate}</span>
              <span className="admin-table-meta">{row.rateDate}</span>
            </article>
          ))}
          {rows.length === 0 && (
            <div className="admin-empty">
              <h2>Nenhuma taxa cadastrada</h2>
              <p>Sem taxa, valores de providers em moeda estrangeira não são convertidos para BRL.</p>
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
