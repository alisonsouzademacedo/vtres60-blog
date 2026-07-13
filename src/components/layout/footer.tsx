import Link from "next/link";
import Image from "next/image";
import type { BrandingSettings, PortalSettings } from "@/types/admin";
import styles from "./footer.module.css";

export function Footer({settings,branding}:{settings:PortalSettings;branding:BrandingSettings}) {
  const logo=branding.logoDark||branding.logoPrimary;
  return <footer className={styles.footer}>
    <div className={`container ${styles.grid}`}>
      <div>{logo?<Link className={styles.brand} href="/"><Image src={logo} alt={settings.portalName} width={190} height={45}/></Link>:<Link className={styles.brand} href="/">VTRES<span>60</span> <small>INDÚSTRIA</small></Link>}<p>{settings.institutionalDescription}</p></div>
      {settings.footerColumns.map((column)=><div key={column.title}><b>{column.title}</b>{column.links.map((link)=><Link href={link.url} key={`${link.label}-${link.url}`}>{link.label}</Link>)}</div>)}
    </div>
    <div className={`container ${styles.bottom}`}><span>{settings.footerText}</span><span>{settings.footerNote}</span></div>
  </footer>;
}
