import Link from "next/link";
import { ExternalLink } from "lucide-react";
export function AdminPageHeading({eyebrow,title,description}:{eyebrow:string;title:string;description:string}){return <header className="admin-page-head"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><Link className="admin-live-link" href="/" target="_blank">Ver site ao vivo <ExternalLink size={14}/></Link></header>}
