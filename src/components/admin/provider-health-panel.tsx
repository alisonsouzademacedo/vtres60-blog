import type { ProviderHealthResult } from "@/lib/agent/health/provider-health";

const PROVIDER_LABELS: Record<ProviderHealthResult["provider"], string> = {
  openai: "OpenAI (LLM)",
  gnews: "GNews (busca de notícias)",
  replicate: "Replicate (geração de imagem)",
  pexels: "Pexels (banco de imagens)",
  supabase: "Supabase (banco de dados)",
};

const STATUS_LABELS: Record<ProviderHealthResult["status"], string> = {
  healthy: "Saudável",
  degraded: "Degradado",
  unavailable: "Indisponível",
  not_configured: "Não configurado",
  billing_unknown: "Saldo não verificado",
};

// Fase 6 (Secao 26) — usa o mesmo data-status do admin.css; billing_unknown
// e not_configured caem no estilo neutro padrao (nao sao "erro").
const STATUS_DATA_ATTR: Record<ProviderHealthResult["status"], string> = {
  healthy: "published",
  degraded: "rejected",
  unavailable: "failed",
  not_configured: "draft",
  billing_unknown: "draft",
};

export function ProviderHealthPanel({ providers, cached }: { providers: ProviderHealthResult[]; cached: boolean }) {
  return (
    <section className="admin-card">
      <header>
        <div>
          <h2>Saúde dos providers</h2>
          <p>
            Checagem mínima de autenticação/conectividade (sem gerar conteúdo ou custo) — dados{" "}
            {cached ? "em cache (até 60s)" : "recém-verificados"}.
          </p>
        </div>
      </header>
      <section className="admin-table">
        <div className="admin-table-head">
          <span>Provider</span>
          <span>Latência</span>
          <span>Status</span>
          <span>Detalhe</span>
        </div>
        {providers.map((provider) => (
          <article className="admin-table-row" key={provider.provider}>
            <div className="admin-table-title">
              <b>{PROVIDER_LABELS[provider.provider]}</b>
            </div>
            <span className="admin-table-meta">{provider.latencyMs !== undefined ? `${provider.latencyMs}ms` : "—"}</span>
            <span className="admin-status" data-status={STATUS_DATA_ATTR[provider.status]}>
              {STATUS_LABELS[provider.status]}
            </span>
            <span className="admin-table-meta">{provider.detail}</span>
          </article>
        ))}
      </section>
    </section>
  );
}
