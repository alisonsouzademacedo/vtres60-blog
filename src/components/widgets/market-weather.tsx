import { getCachedCurrencies } from "@/lib/market/currency-provider";
import { fetchAllCommodities } from "@/lib/market/commodities-provider";
import { getCachedWeather } from "@/lib/market/weather-provider";
import { AlertTriangle, TrendingUp } from "@/components/ui/icons";
import { WeatherWidget } from "./weather-widget";
import styles from "./market-weather.module.css";

/**
 * Fase 8C — substitui os dados 100% mockados da Fase 8A/8B por fontes
 * reais (BCB/PTAX para moedas, World Bank Pink Sheet para commodities,
 * INMET para clima). Ver docs/fontes-mercado-clima-fase8c.md para o
 * detalhe de cada fonte, e a secao 4/11 da spec para a regra de
 * veracidade que rege este componente: nunca mostrar valor fictício,
 * sempre mostrar fonte/data/frequência, e nunca voltar para o mock
 * antigo quando uma fonte falha (mostra "indisponível" em vez disso).
 */
export async function MarketWeather() {
  const [{ data: currencies }, commodities, { data: weather }] = await Promise.all([
    getCachedCurrencies(),
    fetchAllCommodities(),
    getCachedWeather(),
  ]);

  const quotes = [...currencies, ...commodities];

  return (
    <section className={`section ${styles.section}`}>
      <div className="container">
        <div className="section-head">
          <div>
            <span className="eyebrow">Referências de mercado</span>
            <h2 className="section-title">Moedas e commodities industriais</h2>
          </div>
        </div>
        <div className={styles.layout}>
          <div className={styles.quotes}>
            {quotes.map((quote) => (
              <div className={styles.quote} key={quote.id}>
                <span>{quote.label}</span>
                {quote.freshnessStatus === "unavailable" ? (
                  <>
                    <strong className={styles.unavailableValue}>
                      <AlertTriangle size={12} /> Indisponível
                    </strong>
                    <small className={styles.neutral}>{quote.error ?? "Sem dado no momento"}</small>
                  </>
                ) : (
                  <>
                    <strong>{quote.formattedValue}</strong>
                    {quote.variation != null ? (
                      <small className={quote.variation >= 0 ? styles.up : styles.down}>
                        <TrendingUp size={12} />
                        {quote.variation >= 0 ? "+" : ""}
                        {quote.variation.toFixed(2)}%
                      </small>
                    ) : (
                      <small className={styles.neutral}>{quote.frequency}</small>
                    )}
                    <em className={styles.sourceTag}>
                      {freshnessLabel(quote.freshnessStatus)} · {quote.sourceName}
                    </em>
                  </>
                )}
              </div>
            ))}
          </div>
          <WeatherWidget initial={weather} />
        </div>
      </div>
    </section>
  );
}

function freshnessLabel(status: string): string {
  switch (status) {
    case "live":
      return "Ao vivo";
    case "delayed":
      return "Cotação de referência";
    case "stale":
      return "Dado desatualizado";
    case "updating":
      return "Atualizando";
    default:
      return "Indisponível";
  }
}
