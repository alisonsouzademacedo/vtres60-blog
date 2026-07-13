import { CloudSun, TrendingUp } from "@/components/ui/icons";
import styles from "./market-weather.module.css";

const quotes = [["Dólar","R$ 5,48","+0,42%"],["Euro","R$ 6,41","+0,18%"],["Petróleo","US$ 68,74","−0,31%"],["Aço","US$ 457","+1,12%"],["Alumínio","US$ 2.535","+0,22%"],["Cobre","US$ 9.842","+0,74%"]];

export function MarketWeather(){return <section className={`section ${styles.section}`}><div className="container"><div className="section-head"><div><span className="eyebrow">Pulso da economia</span><h2 className="section-title">Mercado industrial</h2></div><span className={styles.update}>Dados demonstrativos · 18:00</span></div><div className={styles.layout}><div className={styles.quotes}>{quotes.map(([name,value,delta])=><div className={styles.quote} key={name}><span>{name}</span><strong>{value}</strong><small className={delta.startsWith("+")?styles.up:styles.down}><TrendingUp size={12}/>{delta}</small></div>)}</div><aside className={styles.weather}><div><CloudSun size={32}/><span>Joinville, SC<small>Parcialmente nublado</small></span></div><strong>21°</strong><footer>Máx. 25° <i/> Mín. 16°</footer></aside></div></div></section>}
