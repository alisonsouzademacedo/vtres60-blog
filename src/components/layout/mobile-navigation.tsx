"use client";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect,useState } from "react";
import type { ManagedCategory } from "@/types/editorial";
import styles from "./header.module.css";

export function MobileNavigation({categories}:{categories:ManagedCategory[]}){
  const[open,setOpen]=useState(false);
  useEffect(()=>{document.body.style.overflow=open?"hidden":"";const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};const resize=()=>{if(window.innerWidth>760)setOpen(false)};window.addEventListener("keydown",close);window.addEventListener("resize",resize);return()=>{document.body.style.overflow="";window.removeEventListener("keydown",close);window.removeEventListener("resize",resize)}},[open]);
  return <div className={styles.mobileNavigation}><button className={styles.menu} type="button" aria-expanded={open} aria-controls="mobile-portal-menu" aria-label={open?"Fechar menu":"Abrir menu"} onClick={()=>setOpen(value=>!value)}>{open?<X size={20}/>:<Menu size={20}/>}</button>{open&&<div className={styles.mobilePanel} id="mobile-portal-menu"><nav aria-label="Menu mobile"><Link href="/noticias" onClick={()=>setOpen(false)}>Últimas Notícias</Link>{categories.filter(category=>category.showInMenu).sort((a,b)=>a.menuOrder-b.menuOrder).map(category=><Link href={`/categorias/${category.slug}`} onClick={()=>setOpen(false)} key={category.id}>{category.name}</Link>)}<Link href="/segmentos" onClick={()=>setOpen(false)}>Segmentos Industriais</Link><Link href="/agenda" onClick={()=>setOpen(false)}>Agenda Industrial</Link></nav></div>}</div>
}
