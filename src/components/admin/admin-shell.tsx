"use client";
import { withBasePath } from "@/lib/paths";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Activity, BookOpen, Bot, CalendarDays, DatabaseBackup, DollarSign, ExternalLink, FolderOpen, Home, Image, Images, LayoutDashboard, LogOut, Mail, Newspaper, Palette, Search, Settings, Star, Tag, Tags, Users } from "lucide-react";

const groups = [
  { label: "Geral", links: [
    ["Dashboard", "/admin", LayoutDashboard], ["Configurações do Blog", "/admin/configuracoes", Settings],
    ["Identidade Visual", "/admin/identidade-visual", Palette], ["SEO Global", "/admin/seo", Search],
  ] },
  { label: "Conteúdo", links: [
    ["Notícias", "/admin/noticias", Newspaper], ["Artigos Educativos", "/admin/artigos", BookOpen],
    ["Categorias", "/admin/categorias", FolderOpen], ["Autores", "/admin/autores", Users], ["Tags", "/admin/tags", Tag],
  ] },
  { label: "Portal", links: [
    ["Home", "/admin/home", Home], ["Hero", "/admin/hero", Image], ["Destaque Editorial", "/admin/destaque-editorial", Star],
    ["Últimas Notícias", "/admin/ultimas-noticias", Newspaper], ["Segmentos Industriais", "/admin/segmentos", Tags],
    ["Agenda Industrial", "/admin/agenda", CalendarDays], ["Newsletter", "/admin/newsletter", Mail],
  ] },
  { label: "Operação", links: [
    ["Agente Autônomo", "/admin/agente", Bot], ["Custos e APIs", "/admin/custos", DollarSign],
    ["Biblioteca de Mídia", "/admin/midia", Images], ["Leads e Newsletter", "/admin/leads", Mail],
  ] },
  { label: "Sistema", links: [
    ["Backup", "/admin/backup", DatabaseBackup], ["Logs", "/admin/logs", Activity], ["Ver site ao vivo", "/", ExternalLink],
  ] },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter();
  async function logout(){ await fetch(withBasePath("/api/admin/auth/logout"),{method:"POST"}); router.push("/admin/login"); router.refresh(); }
  return <div className="admin-root"><div className="admin-shell"><aside className="admin-sidebar"><Link href="/admin" className="admin-brand"><span className="admin-brand-mark">V</span><span><strong>VTRES60 Admin</strong><small>PORTAL INDÚSTRIA</small></span></Link><nav className="admin-nav">{groups.map((group)=><div className="admin-nav-group" key={group.label}><span>{group.label}</span>{group.links.map(([label,href,Icon])=><Link href={href} target={href==="/"?"_blank":undefined} data-active={href==="/admin"?pathname===href:pathname.startsWith(href)} key={href}><Icon size={15}/>{label}</Link>)}</div>)}</nav><button className="admin-logout" aria-label="Sair do painel" onClick={logout}><LogOut size={15}/><span>Sair do painel</span></button></aside><main className="admin-main">{children}</main></div></div>;
}


