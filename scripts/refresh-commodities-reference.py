#!/usr/bin/env python3
"""
Fase 8C - atualiza src/content/commodities-reference.json a partir do
World Bank Commodity Markets (Pink Sheet), fonte oficial mensal, CC-BY,
sem chave de API. Roda fora do runtime do Next.js de proposito: o arquivo
fonte e um .xlsx de ~500KB atualizado uma vez por mes, entao nao ha
motivo para parsear XLSX a cada requisicao do site (nem para adicionar
uma dependencia npm de parsing de planilha so para isso).

Uso: rodar manualmente (ou via cron externo, fora do PM2 desta fase)
uma vez por mes, apos o dia de atualizacao do Banco Mundial (ver
"publishedOn" no proprio JSON gerado). Requer `pip install openpyxl`
(nao e dependencia do projeto Node - script standalone).
"""
import json
import re
import urllib.request
from datetime import datetime, timezone

import openpyxl

FILE_URL = "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx"
OUTPUT_PATH = "src/content/commodities-reference.json"

WANTED = {
    "Crude oil, average": "oil",
    "Copper": "copper",
    "Aluminum": "aluminum",
    "Iron ore, cfr spot": "iron_ore",
}


def main():
    tmp_path = "/tmp/cmo-monthly.xlsx"
    urllib.request.urlretrieve(FILE_URL, tmp_path)

    wb = openpyxl.load_workbook(tmp_path, data_only=True)
    ws = wb["Monthly Prices"]
    rows = list(ws.iter_rows(values_only=True))
    header, units, last = rows[4], rows[5], rows[-1]

    updated_match = re.search(r"Updated on (.+)", str(rows[3][0]))
    updated_on = updated_match.group(1) if updated_match else None

    series = {}
    for i, h in enumerate(header):
        if h in WANTED:
            series[WANTED[h]] = {"label": h, "unit": units[i], "value": last[i]}

    out = {
        "source": "World Bank Commodity Markets (Pink Sheet)",
        "sourceUrl": "https://www.worldbank.org/en/research/commodity-markets",
        "fileUrl": FILE_URL,
        "license": "CC-BY (Creative Commons Attribution)",
        "referenceMonth": last[0],
        "publishedOn": updated_on,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "series": series,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Escrito {OUTPUT_PATH}: referencia {out['referenceMonth']}, publicado em {updated_on}")


if __name__ == "__main__":
    main()
