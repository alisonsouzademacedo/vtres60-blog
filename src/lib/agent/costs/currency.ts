// Fase 7 (Secao 16) — conversao BRL manual. Nenhum provider de cambio
// externo: a taxa vem SEMPRE de currency_rates (configurada no admin).
// Sem taxa cadastrada, o valor original nunca e ocultado nem uma taxa e
// inventada — apenas brlAmount fica undefined.
export interface CurrencyConversionResult {
  originalAmount: number;
  originalCurrency: string;
  brlAmount: number | undefined;
  rateApplied: number | undefined;
  rateDate: string | undefined;
}

export function convertToBrl(
  amount: number,
  currency: string,
  rate: { rate: number; rateDate: string } | undefined,
): CurrencyConversionResult {
  if (currency === "BRL") {
    return { originalAmount: amount, originalCurrency: currency, brlAmount: amount, rateApplied: undefined, rateDate: undefined };
  }
  if (!rate) {
    return { originalAmount: amount, originalCurrency: currency, brlAmount: undefined, rateApplied: undefined, rateDate: undefined };
  }
  return {
    originalAmount: amount,
    originalCurrency: currency,
    brlAmount: amount * rate.rate,
    rateApplied: rate.rate,
    rateDate: rate.rateDate,
  };
}
