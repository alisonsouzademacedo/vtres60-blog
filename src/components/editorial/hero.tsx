import Link from "next/link";
import { ArrowRight, Search } from "@/components/ui/icons";
import type { HomeSettings } from "@/types/admin";
import styles from "./hero.module.css";

export function Hero({config}:{config:HomeSettings["hero"]}) {
  if(!config.enabled)return null;
  return <section className={styles.hero} style={{backgroundColor:config.background,color:config.textColor}} data-visual={config.visual}>
    <div className={`container ${styles.inner}`}><div className={styles.copy}><h1>{config.title} <em>{config.highlightedText}</em></h1>{config.showSubtitle&&config.subtitle&&<p>{config.subtitle}</p>}<div className={styles.ctas}>{config.showPrimaryButton&&<Link href={config.primaryButton.url}>{config.primaryButton.label} <ArrowRight size={16} /></Link>}{config.showSecondaryButton&&<Link href={config.secondaryButton.url}>{config.secondaryButton.label}</Link>}</div></div></div>
    {config.showSearch&&<div className={`container ${styles.searchWrap}`}>
      <form action="/buscar" className={styles.search}><Search size={20} /><input name="q" aria-label="Pesquisar no portal" placeholder={config.searchPlaceholder} /><button>Pesquisar</button></form>
    </div>}
  </section>;
}
