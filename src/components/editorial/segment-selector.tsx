"use client";

import { useEffect, useState } from "react";
import { segments } from "@/data/content";
import { Factory } from "@/components/ui/icons";
import styles from "./segment-selector.module.css";

export function SegmentSelector() {
  const [active, setActive] = useState("Todos os setores");
  const applyPreference = (value: string) => {
    document.querySelectorAll<HTMLElement>("[data-segments]").forEach((element) => {
      const matches = value === "Todos os setores" || element.dataset.segments?.split("|").includes(value);
      element.classList.toggle("segment-priority", value !== "Todos os setores" && Boolean(matches));
    });
  };
  useEffect(() => {
    const saved = window.localStorage.getItem("vtres60-segment") ?? "Todos os setores";
    setActive(saved);
    applyPreference(saved);
  }, []);
  const select = (value: string) => {
    setActive(value);
    applyPreference(value);
    window.localStorage.setItem("vtres60-segment", value);
    window.dispatchEvent(new CustomEvent("segment-change", { detail: value }));
  };
  return <section className={styles.wrap} aria-labelledby="segment-title"><div className={`container ${styles.inner}`}>
    <div className={styles.label}><Factory size={19}/><div><strong id="segment-title">Seu setor em primeiro plano</strong><span>Personalize a curadoria do portal</span></div></div>
    <div className={styles.scroller}><button aria-pressed={active === "Todos os setores"} onClick={()=>select("Todos os setores")} className={active === "Todos os setores" ? styles.active : ""}>Todos</button>{segments.map(segment=><button aria-pressed={active === segment} onClick={()=>select(segment)} className={active === segment ? styles.active : ""} key={segment}>{segment}</button>)}</div>
  </div></section>;
}
