import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { unstable_noStore as noStore } from "next/cache";
import { companies as legacyCompanies, events as legacyEvents, segmentProfiles } from "@/data/content";
import type { AdminLog, IntelligenceItem, Lead, ManagedCompany, ManagedEvent, ManagedSegment, MediaAsset, RadarSignal } from "@/types/operations";

/**
 * Fase 9B.1 — feature flags de fonte de verdade. Lidas em cada chamada (não
 * em módulo-load) para que os testes possam alternar via `vi.stubEnv` sem
 * reimport. Default "false" em ambos: produção continua em JSON até uma
 * decisão explícita de corte (ver docs/implementacao-fase9b1-supabase-dominios.md).
 * Radar e Inteligência compartilham uma única flag porque intelligence_items
 * tem FK real para radar_signals no Postgres — não é possível ter uma em
 * Supabase e a outra em JSON ao mesmo tempo.
 *
 * Import DINÂMICO e proposital: "./supabase-operations-repository" importa
 * "@/lib/supabase", que cria o client do Supabase (e falha se as env vars
 * não existirem) já no module-load. Um import estático no topo deste arquivo
 * quebraria toda leitura/escrita em JSON (inclusive com a flag desligada,
 * inclusive em testes sem Supabase configurado) por causa de um provedor que
 * nem está em uso nesse caminho. Com import dinâmico, o client só é criado
 * quando uma das flags acima está realmente "true".
 */
const companiesSupabaseSource = () => process.env.COMPANIES_SUPABASE_SOURCE === "true";
const radarIntelligenceSupabaseSource = () => process.env.RADAR_INTELLIGENCE_SUPABASE_SOURCE === "true";
const loadSupabaseOps = () => import("./supabase-operations-repository").then((mod) => mod.supabaseOperationsRepository);

type Collection="segments"|"events"|"media"|"leads"|"logs"|"companies"|"radarSignals"|"intelligenceItems";
type Map={segments:ManagedSegment;events:ManagedEvent;media:MediaAsset;leads:Lead;logs:AdminLog;companies:ManagedCompany;radarSignals:RadarSignal;intelligenceItems:IntelligenceItem};
const contentDir=path.join(process.cwd(),"src","content"),uploadsDir=path.join(process.cwd(),"public","uploads");
const target=(collection:Collection)=>path.join(contentDir,`${collection}.json`),marker=(collection:Collection)=>path.join(contentDir,`.${collection}-seed-v1`),now=()=>new Date().toISOString();
function seeds<K extends Collection>(collection:K):Map[K][]{const timestamp=now();if(collection==="segments")return segmentProfiles.map((item,index)=>({id:`segment-${item.slug}`,name:item.name,slug:item.slug,description:`Notícias, tendências e inteligência para empresas do segmento de ${item.name.toLowerCase()}.`,image:item.image,imageAlt:item.imageAlt,icon:"factory",articleCount:item.articleCount,order:index+1,showOnHome:true,metaTitle:`${item.name}: notícias e inteligência industrial`,metaDescription:`Acompanhe notícias, tecnologia e mercado para o segmento de ${item.name.toLowerCase()}.`,createdAt:timestamp,updatedAt:timestamp})) as unknown as Map[K][];if(collection==="events")return legacyEvents.map((item,index)=>{const[city,state]=item.location.split(",").map(value=>value.trim());return{id:`event-${item.slug}`,name:item.title,slug:item.slug,mainImage:item.image,imageAlt:item.imageAlt,additionalImages:[],startDate:item.startDate,endDate:item.endDate,month:item.month,city,state,venue:item.venue,address:item.address,segment:item.segment,expectedAudience:item.expectedAudience,exhibitors:item.exhibitors,description:item.description,whyFollow:item.whyFollow,opportunities:item.opportunities,officialUrl:item.ctaUrl,ctaLabel:"Visitar site do evento",status:"candidate",showOnHome:true,displayOrder:index+1,relatedEventIds:[],dataStatus:item.dataStatus,createdAt:timestamp,updatedAt:timestamp}}) as unknown as Map[K][];if(collection==="companies")return legacyCompanies.map(item=>({id:`company-${item.slug}`,name:item.name,slug:item.slug,description:item.description,sector:item.sector,website:{weg:"https://www.weg.net",gerdau:"https://www.gerdau.com","marcopolo":"https://www.marcopolo.com.br",randon:"https://www.randon.com.br","john-deere":"https://www.deere.com",tramontina:"https://www.tramontina.com.br"}[item.slug]??"",ticker:item.ticker,tickerSource:item.ticker?"Ticker já presente na base editorial anterior; símbolo público B3/CVM.":undefined,active:true,featured:false,createdAt:timestamp,updatedAt:timestamp}))as unknown as Map[K][];return[]}
async function write<K extends Collection>(collection:K,items:Map[K][]){const file=target(collection),temporary=`${file}.${randomUUID()}.tmp`;await fs.writeFile(temporary,`${JSON.stringify(items,null,2)}\n`,"utf8");await fs.rename(temporary,file)}
async function read<K extends Collection>(collection:K):Promise<Map[K][]> {noStore();let items:Map[K][];try{items=JSON.parse(await fs.readFile(target(collection),"utf8"))}catch{items=[]}if((collection==="segments"||collection==="events"||collection==="companies")&&items.length===0){try{await fs.access(marker(collection))}catch{items=seeds(collection);await write(collection,items);await fs.writeFile(marker(collection),"seeded\n")}}return items}
async function create<K extends Collection>(collection:K,input:Omit<Map[K],"id"|"createdAt"|"updatedAt">){const items=await read(collection),timestamp=now();const item={...input,id:randomUUID(),createdAt:timestamp,updatedAt:timestamp} as Map[K];if("slug" in item&&items.some(record=>"slug" in record&&record.slug===item.slug))throw new Error("Este slug já está em uso.");await write(collection,[item,...items]);return item}
async function update<K extends Collection>(collection:K,id:string,patch:Partial<Map[K]>){const items=await read(collection),index=items.findIndex(item=>item.id===id);if(index<0)return;const item={...items[index],...patch,id,updatedAt:now()} as Map[K];if("slug" in item&&items.some((record,i)=>i!==index&&"slug" in record&&record.slug===item.slug))throw new Error("Este slug já está em uso.");items[index]=item;await write(collection,items);return item}
async function remove<K extends Collection>(collection:K,id:string){const items=await read(collection),next=items.filter(item=>item.id!==id);if(next.length===items.length)return false;await write(collection,next);return true}
async function get<K extends Collection>(collection:K,value:string){return(await read(collection)).find(item=>item.id===value||("slug" in item&&item.slug===value))}
function expireIfPast<T extends{status:string;validUntil:string}>(item:T):T{return item.status==="published"&&new Date(item.validUntil).getTime()<Date.now()?{...item,status:"expired"}:item}
async function sweepExpiry<K extends "radarSignals"|"intelligenceItems">(collection:K){const items=await read(collection);const swept=items.map(item=>expireIfPast(item as unknown as{status:string;validUntil:string}))as Map[K][];if(swept.some((item,i)=>(item as{status:string}).status!==(items[i] as{status:string}).status))await write(collection,swept);return swept}

export const operationsRepository={
  listSegments:()=>read("segments"),getSegment:(value:string)=>get("segments",value),createSegment:(input:Omit<ManagedSegment,"id"|"createdAt"|"updatedAt">)=>create("segments",input),updateSegment:(id:string,patch:Partial<ManagedSegment>)=>update("segments",id,patch),deleteSegment:(id:string)=>remove("segments",id),
  listEvents:()=>read("events"),getEvent:(value:string)=>get("events",value),createEvent:(input:Omit<ManagedEvent,"id"|"createdAt"|"updatedAt">)=>create("events",input),updateEvent:(id:string,patch:Partial<ManagedEvent>)=>update("events",id,patch),deleteEvent:(id:string)=>remove("events",id),
  listCompanies:async()=>companiesSupabaseSource()?(await loadSupabaseOps()).listCompanies():read("companies"),
  getCompany:async(value:string)=>companiesSupabaseSource()?(await loadSupabaseOps()).getCompany(value):get("companies",value),
  createCompany:async(input:Omit<ManagedCompany,"id"|"createdAt"|"updatedAt">)=>companiesSupabaseSource()?(await loadSupabaseOps()).createCompany(input):create("companies",input),
  updateCompany:async(id:string,patch:Partial<ManagedCompany>)=>companiesSupabaseSource()?(await loadSupabaseOps()).updateCompany(id,patch):update("companies",id,patch),
  deleteCompany:async(id:string)=>companiesSupabaseSource()?(await loadSupabaseOps()).deleteCompany(id):remove("companies",id),
  listRadarSignals:async()=>radarIntelligenceSupabaseSource()?(await loadSupabaseOps()).listRadarSignals():sweepExpiry("radarSignals"),
  getRadarSignal:async(value:string)=>radarIntelligenceSupabaseSource()?(await loadSupabaseOps()).getRadarSignal(value):(await sweepExpiry("radarSignals")).find(item=>item.id===value||undefined)??(await get("radarSignals",value)),
  createRadarSignal:async(input:Omit<RadarSignal,"id"|"createdAt"|"updatedAt">)=>radarIntelligenceSupabaseSource()?(await loadSupabaseOps()).createRadarSignal(input):create("radarSignals",input),
  updateRadarSignal:async(id:string,patch:Partial<RadarSignal>)=>radarIntelligenceSupabaseSource()?(await loadSupabaseOps()).updateRadarSignal(id,patch):update("radarSignals",id,patch),
  deleteRadarSignal:async(id:string)=>radarIntelligenceSupabaseSource()?(await loadSupabaseOps()).deleteRadarSignal(id):remove("radarSignals",id),
  listIntelligenceItems:async()=>radarIntelligenceSupabaseSource()?(await loadSupabaseOps()).listIntelligenceItems():sweepExpiry("intelligenceItems"),
  getIntelligenceItem:async(value:string)=>radarIntelligenceSupabaseSource()?(await loadSupabaseOps()).getIntelligenceItem(value):(await sweepExpiry("intelligenceItems")).find(item=>item.id===value)??(await get("intelligenceItems",value)),
  createIntelligenceItem:async(input:Omit<IntelligenceItem,"id"|"createdAt"|"updatedAt">)=>radarIntelligenceSupabaseSource()?(await loadSupabaseOps()).createIntelligenceItem(input):create("intelligenceItems",input),
  updateIntelligenceItem:async(id:string,patch:Partial<IntelligenceItem>)=>radarIntelligenceSupabaseSource()?(await loadSupabaseOps()).updateIntelligenceItem(id,patch):update("intelligenceItems",id,patch),
  deleteIntelligenceItem:async(id:string)=>radarIntelligenceSupabaseSource()?(await loadSupabaseOps()).deleteIntelligenceItem(id):remove("intelligenceItems",id),
  listMedia:()=>read("media"),getMedia:(id:string)=>get("media",id),createMedia:(input:Omit<MediaAsset,"id"|"createdAt"|"updatedAt">)=>create("media",input),updateMedia:(id:string,patch:Partial<MediaAsset>)=>update("media",id,patch),
  async deleteMedia(id:string){const item=await get("media",id) as MediaAsset|undefined;if(!item)return false;const filename=path.basename(item.url);await fs.unlink(path.join(uploadsDir,filename)).catch(()=>undefined);return remove("media",id)},
  async renameMedia(id:string,name:string){const item=await get("media",id) as MediaAsset|undefined;if(!item)return;const extension=path.extname(item.filename),base=name.replace(path.extname(name),"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9-_]+/g,"-").replace(/(^-|-$)/g,"")||"imagem";let filename=`${base}${extension}`,counter=2;while(filename!==item.filename){try{await fs.access(path.join(uploadsDir,filename));filename=`${base}-${counter++}${extension}`}catch{break}}const oldPath=path.join(uploadsDir,path.basename(item.url)),newPath=path.join(uploadsDir,filename);if(oldPath!==newPath)await fs.rename(oldPath,newPath);return update("media",id,{filename,url:`/uploads/${filename}`} as Partial<MediaAsset>)},
  listLeads:()=>read("leads"),createLead:(input:Omit<Lead,"id"|"createdAt">)=>create("leads",input as Omit<Lead,"id"|"createdAt"|"updatedAt">),deleteLead:(id:string)=>remove("leads",id),
  listLogs:()=>read("logs"),async log(action:string,module:string,description:string){const items=await read("logs");const entry:AdminLog={id:randomUUID(),action,module,description,createdAt:now()};await write("logs",[entry,...items].slice(0,1000));return entry},
  async replaceCollection<K extends Collection>(collection:K,items:Map[K][]){await write(collection,items)},
};
