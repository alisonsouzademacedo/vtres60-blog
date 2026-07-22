"use client";

import { useEffect, useState } from "react";
import { Factory } from "@/components/ui/icons";
import styles from "./segment-selector.module.css";

const ALL = "Todos os setores";

/**
 * Fase 8B — recebe `segments` (nomes reais, mesma fonte canonica de
 * segments.json que ja alimenta SegmentShowcase/`/segmentos`) em vez de
 * importar o array estatico e desatualizado de src/data/content.ts. Isso
 * garante que os botoes de filtro sempre batem com os segmentos que
 * realmente existem (e com o admin), e que `data-segments` nos cards
 * (preenchido a partir de post.segmentSlugs -> nomes) tem chance real de
 * coincidir.
 */
export function SegmentSelector({ segments }: { segments: string[] }) {
  const [active, setActive] = useState(ALL);
  const applyPreference = (value: string) => {
    document.querySelectorAll<HTMLElement>("[data-segments]").forEach((element) => {
      const matches = value === ALL || element.dataset.segments?.split("|").includes(value);
      element.classList.toggle("segment-priority", value !== ALL && Boolean(matches));
    });
  };
  useEffect(() => {
    const saved = window.localStorage.getItem("vtres60-segment") ?? ALL;
    const initial = segments.includes(saved) ? saved : ALL;
    setActive(initial);
    applyPreference(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const select = (value: string) => {
    setActive(value);
    applyPreference(value);
    window.localStorage.setItem("vtres60-segment", value);
    window.dispatchEvent(new CustomEvent("segment-change", { detail: value }));
  };
  if (segments.length === 0) return null;
  return (
    <section className={styles.wrap} aria-labelledby="segment-title">
      <div className={`container ${styles.inner}`}>
        <div className={styles.label}>
          <Factory size={19} />
          <div>
            <strong id="segment-title">Seu setor em primeiro plano</strong>
            <span>Personalize a curadoria do portal</span>
          </div>
        </div>
        <div className={styles.scroller}>
          <button aria-pressed={active === ALL} onClick={() => select(ALL)} className={active === ALL ? styles.active : ""}>
            Todos
          </button>
          {segments.map((segment) => (
            <button
              aria-pressed={active === segment}
              onClick={() => select(segment)}
              className={active === segment ? styles.active : ""}
              key={segment}
            >
              {segment}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
