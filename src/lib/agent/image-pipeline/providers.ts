import axios from "axios";

export interface PexelsCandidate {
  url: string; // src.original — maior resolucao disponivel para download/QA
  photographer: string | undefined;
  photographerUrl: string | undefined;
  pageUrl: string | undefined;
}

const PEXELS_CANDIDATE_COUNT = 3;

// Pexels: pequeno conjunto controlado de candidatas (nao apenas a
// primeira) — o ImageProcessor decide entre elas com base em QA/dedupe
// real (download + decode + resolucao + hash), nao so na ordem de retorno
// da API.
export async function fetchPexelsCandidates(keyword: string): Promise<PexelsCandidate[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey || !keyword) return [];
  try {
    const { data } = await axios.get("https://api.pexels.com/v1/search", {
      params: { query: keyword, per_page: PEXELS_CANDIDATE_COUNT, orientation: "landscape" },
      headers: { Authorization: apiKey },
      timeout: 10_000,
    });
    const photos = Array.isArray(data?.photos) ? data.photos : [];
    return photos
      .map((photo: Record<string, unknown>) => {
        const src = photo.src as Record<string, unknown> | undefined;
        const url = src?.original as string | undefined;
        if (!url) return undefined;
        return {
          url,
          photographer: (photo.photographer as string | undefined) ?? undefined,
          photographerUrl: (photo.photographer_url as string | undefined) ?? undefined,
          pageUrl: (photo.url as string | undefined) ?? undefined,
        };
      })
      .filter((candidate: PexelsCandidate | undefined): candidate is PexelsCandidate => Boolean(candidate));
  } catch {
    return [];
  }
}

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string[] | string | null;
}

function extractReplicateUrl(output: ReplicatePrediction["output"]): string | undefined {
  if (!output) return undefined;
  return Array.isArray(output) ? output[0] : output;
}

// Replicate/Flux-schnell — provider e modelo preservados da Fase 3 (so o
// prompt mudou, ver replicate-prompt.ts). Endpoint de "modelo oficial"
// (nao fixa version hash). Qualquer falha (402 sem credito, rede, timeout)
// e capturada graciosamente — devolve undefined, quem chama cai pro tier
// seguinte.
export async function generateWithReplicate(prompt: string): Promise<string | undefined> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return undefined;

  try {
    const { data: prediction } = await axios.post<ReplicatePrediction>(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions",
      { input: { prompt } },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Prefer: "wait=30",
        },
        timeout: 35_000,
      },
    );

    let current = prediction;
    for (
      let attempt = 0;
      attempt < 10 && current.status !== "succeeded" && current.status !== "failed" && current.status !== "canceled";
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const { data } = await axios.get<ReplicatePrediction>(`https://api.replicate.com/v1/predictions/${current.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10_000,
      });
      current = data;
    }

    return current.status === "succeeded" ? extractReplicateUrl(current.output) : undefined;
  } catch {
    return undefined;
  }
}
