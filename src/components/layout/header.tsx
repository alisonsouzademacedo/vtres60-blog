import Image from "next/image";
import Link from "next/link";
import { Bell, Search } from "@/components/ui/icons";
import { MobileNavigation } from "./mobile-navigation";
import type { BrandingSettings, PortalSettings } from "@/types/admin";
import type { ManagedCategory } from "@/types/editorial";
import styles from "./header.module.css";

export function Header({settings,branding,categories}:{settings:PortalSettings;branding:BrandingSettings;categories:ManagedCategory[]}) {
  const logo=branding.logoDark||branding.logoPrimary;
  return (
    <>
      <a className="sr-only focus-ring" href="#conteudo">Pular para o conteúdo</a>
      <header className={styles.header}>
        <div className={`container ${styles.main}`}>
          <MobileNavigation categories={categories}/>
          <Link className={styles.brand} href="/" aria-label={`${settings.portalName} — início`}>
            {logo?<Image className={styles.logo} src={logo} alt={settings.portalName} width={190} height={42} priority/>:<><strong>VTRES<span>60</span></strong><i /><small>INDÚSTRIA</small></>}
          </Link>
          <div className={styles.edition}>{settings.subtitle.toUpperCase()}</div>
          <div className={styles.actions}>
            <Link className={styles.search} href="/buscar" aria-label="Abrir busca"><Search size={18} /><span>Buscar</span></Link>
            <Link className={styles.subscribe} href={settings.headerButton.url}><Bell size={16} /> <span>{settings.headerButton.label}</span></Link>
          </div>
        </div>
        <nav className={styles.categories} aria-label="Categorias principais">
          <div className="container">
            <Link className={styles.active} href="/noticias">Últimas Notícias</Link>{categories.filter(category=>category.showInMenu).sort((a,b)=>a.menuOrder-b.menuOrder).map((category) => <Link href={`/categorias/${category.slug}`} key={category.id}>{category.name}</Link>)}
          </div>
        </nav>
      </header>
    </>
  );
}
