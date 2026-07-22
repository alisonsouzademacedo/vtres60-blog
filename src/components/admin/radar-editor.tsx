"use client";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useState } from "react";
import type { ManagedPost, ManagedTag } from "@/types/editorial";
import type { ManagedCompany, ManagedSegment, RadarSignal } from "@/types/operations";

type Draft = Omit<RadarSignal, "sourceUrls" | "createdAt" | "updatedAt">;

function blank(): Draft {
  return { id: "", title: "", summary: "", evidencePostIds: [], tagIds: [], segmentSlugs: [], companySlugs: [], confidence: "média", generatedAt: new Date().toISOString(), validUntil: "", status: "draft" };
}

export function RadarEditor({ initial, posts, tags, segments, companies }: { initial?: RadarSignal; posts: ManagedPost[]; tags: ManagedTag[]; segments: ManagedSegment[]; companies: ManagedCompany[] }) {
  const router = useRouter();
  const isNew = !initial;
  const [data, setData] = useState<Draft>(initial ?? blank());
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("Alterações ainda não salvas");
  const change = (key: keyof Draft, value: unknown) => { setData((current) => ({ ...current, [key]: value })); setState("idle"); setMessage("Alterações ainda não salvas"); };
  const toggle = (key: "evidencePostIds" | "tagIds" | "segmentSlugs" | "companySlugs", value: string) => {
    const current = data[key] as string[];
    change(key, current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  };
  async function save(status?: RadarSignal["status"]) {
    setState("saving"); setMessage("Salvando...");
    const payload = status ? { ...data, status, reviewedAt: status === "reviewed" ? new Date().toISOString() : data.reviewedAt } : data;
    const response = await fetch(isNew ? "/api/admin/radar" : `/api/admin/radar/${data.id}`, { method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) { setState("error"); setMessage(body.error || "Falha ao salvar."); return; }
    setData(body); setState("success"); setMessage("Alterações salvas.");
    if (isNew) router.replace(`/admin/radar/${body.id}`);
    router.refresh();
  }
  return <div className="admin-form">
    <details className="admin-section" open><summary>Sinal editorial</summary><div className="admin-section-body"><div className="admin-fields">
      <div className="admin-field admin-field-full"><label htmlFor="radar-title">Título</label><input id="radar-title" value={data.title} onChange={(e) => change("title", e.target.value)} /></div>
      <div className="admin-field admin-field-full"><label htmlFor="radar-summary">Resumo</label><textarea id="radar-summary" value={data.summary} onChange={(e) => change("summary", e.target.value)} /></div>
      <div className="admin-field"><label htmlFor="radar-confidence">Confiança</label><select id="radar-confidence" value={data.confidence} onChange={(e) => change("confidence", e.target.value)}><option value="baixa">Baixa</option><option value="média">Média</option><option value="alta">Alta</option></select></div>
      <div className="admin-field"><label htmlFor="radar-valid">Válido até</label><input id="radar-valid" type="date" value={data.validUntil.slice(0, 10)} onChange={(e) => change("validUntil", e.target.value ? new Date(`${e.target.value}T23:59:59Z`).toISOString() : "")} /></div>
      <div className="admin-field admin-field-full"><label>Posts de evidência (obrigatório para publicar)</label><div className="admin-check-grid">{posts.map((post) => <label className="admin-check" key={post.id}><input type="checkbox" checked={data.evidencePostIds.includes(post.id)} onChange={() => toggle("evidencePostIds", post.id)} />{post.title}</label>)}</div></div>
      <div className="admin-field admin-field-full"><label>Tags reais</label><div className="admin-check-grid">{tags.map((tag) => <label className="admin-check" key={tag.id}><input type="checkbox" checked={data.tagIds.includes(tag.id)} onChange={() => toggle("tagIds", tag.id)} />{tag.name}</label>)}</div></div>
      <div className="admin-field admin-field-full"><label>Segmentos reais</label><div className="admin-check-grid">{segments.map((segment) => <label className="admin-check" key={segment.slug}><input type="checkbox" checked={data.segmentSlugs.includes(segment.slug)} onChange={() => toggle("segmentSlugs", segment.slug)} />{segment.name}</label>)}</div></div>
      <div className="admin-field admin-field-full"><label>Empresas reais</label><div className="admin-check-grid">{companies.map((company) => <label className="admin-check" key={company.slug}><input type="checkbox" checked={data.companySlugs.includes(company.slug)} onChange={() => toggle("companySlugs", company.slug)} />{company.name}</label>)}</div></div>
    </div></div></details>
    <div className="admin-savebar"><span data-state={state}>{message}</span>
      <button className="admin-secondary-button" onClick={() => save()} disabled={state === "saving"}>Salvar rascunho</button>
      <button className="admin-secondary-button" onClick={() => save("reviewed")} disabled={state === "saving"}>Marcar como revisado</button>
      <button className="admin-primary-button" onClick={() => save("published")} disabled={state === "saving"}><Save size={14} />Publicar</button>
    </div>
  </div>;
}
