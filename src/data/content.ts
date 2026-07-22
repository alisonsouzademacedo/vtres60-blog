import type { IndustrialEvent, SegmentProfile } from "@/types/content";

// Fase 8D — este array deixou de alimentar contentRepository.listCompanies()
// (que agora lê de operationsRepository.listCompanies(), com cobertura real
// calculada a partir de posts). Ele sobrevive só como seed inicial da
// coleção "companies" (ver operations-repository.ts) e como fonte de nomes
// para o mapeamento de taxonomia do agente (taxonomies.ts, que usa só
// .name) — por isso não usa mais o tipo público Company, que agora exige
// campos (hasCoverage/postCount/active/featured/website) que não fazem
// sentido inventar aqui.
type LegacyCompanySeed = { name: string; slug: string; ticker?: string; sector: string; description: string; accent: string };

export const companies: LegacyCompanySeed[] = [
  { name: "WEG", slug: "weg", ticker: "WEGE3", sector: "Tecnologia industrial", description: "Motores, energia, automação e transformação industrial.", accent: "#3185ff" },
  { name: "Gerdau", slug: "gerdau", ticker: "GGBR4", sector: "Siderurgia", description: "Aço, construção, mobilidade e economia circular.", accent: "#7c65ff" },
  { name: "Marcopolo", slug: "marcopolo", ticker: "POMO4", sector: "Mobilidade", description: "Transporte coletivo, manufatura e mercados globais.", accent: "#36c4a1" },
  { name: "Randon", slug: "randon", ticker: "RAPT4", sector: "Autopeças", description: "Implementos, autopeças e soluções para mobilidade.", accent: "#ef9b4e" },
  { name: "John Deere", slug: "john-deere", sector: "Máquinas agrícolas", description: "Tecnologia, máquinas e produtividade no campo.", accent: "#6abf69" },
  { name: "Tramontina", slug: "tramontina", sector: "Bens de consumo", description: "Manufatura, design e presença internacional.", accent: "#64a8ff" },
];

export const events: IndustrialEvent[] = [
  { title:"Febrava 2026",slug:"febrava-2026",date:"15–18",month:"SET",location:"São Paulo, SP",segment:"Climatização, refrigeração, ventilação e tratamento do ar",image:"/images/industrial/segmento-energia.png",imageAlt:"Infraestrutura energética e elétrica industrial",startDate:"2026-09-15",endDate:"2026-09-18",venue:"São Paulo Expo",address:"Rodovia dos Imigrantes, km 1,5 — Vila Água Funda, São Paulo — SP, 04329-900",expectedAudience:"25 mil visitantes",exhibitors:"Mais de 500 marcas expositoras",description:"A Febrava reúne fabricantes, distribuidores, projetistas e compradores das cadeias de climatização, refrigeração, ventilação e tratamento do ar.",whyFollow:["Lançamentos em eficiência energética e qualidade do ar","Novas tecnologias para instalações industriais e comerciais","Conexão com especificadores, distribuidores e compradores"],opportunities:["Mapear parceiros e canais de distribuição","Acompanhar demandas de retrofit e eficiência energética","Produzir conteúdo técnico conectado aos lançamentos da feira"],ctaUrl:"https://febrava.com.br",dataStatus:"unverified" },
  { title:"Mercopar",slug:"mercopar",date:"06–09",month:"OUT",location:"Caxias do Sul, RS",segment:"Inovação industrial",image:"/images/industrial/robotica-fabrica.png",imageAlt:"Linha de produção robotizada e inovação industrial",startDate:"2026-10-06",endDate:"2026-10-09",venue:"Centro de Feiras e Eventos Festa da Uva",address:"Rua Ludovico Cavinato, 1431 — Nossa Senhora da Saúde, Caxias do Sul — RS",expectedAudience:"40 mil visitantes",exhibitors:"Cerca de 600 expositores",description:"A Mercopar conecta empresas, tecnologia e oportunidades para a cadeia industrial, com forte presença de fornecedores e fabricantes do Sul do Brasil.",whyFollow:["Inovação aplicada à manufatura","Conexões entre compradores e fornecedores","Tendências para pequenas e médias indústrias"],opportunities:["Desenvolver novos fornecedores","Identificar soluções de automação","Criar relacionamento comercial regional"],ctaUrl:"https://mercopar.com.br",dataStatus:"unverified" },
  { title:"Fenasucro & Agrocana",slug:"fenasucro",date:"11–14",month:"AGO",location:"Sertãozinho, SP",segment:"Bioenergia",image:"/images/industrial/segmento-agronegocio.png",imageAlt:"Máquinas agrícolas e infraestrutura de processamento de grãos",startDate:"2026-08-11",endDate:"2026-08-14",venue:"Centro de Eventos Zanini",address:"Marginal João Olézio Marques, 3563 — Sertãozinho — SP",expectedAudience:"45 mil visitantes",exhibitors:"Mais de 600 marcas",description:"Feira dedicada à bioenergia e às cadeias sucroenergéticas, reunindo tecnologias para produção, manutenção, logística e eficiência industrial.",whyFollow:["Tecnologia para bioenergia e processos industriais","Investimentos da cadeia sucroenergética","Soluções para manutenção e produtividade"],opportunities:["Prospectar usinas e fornecedores","Mapear projetos de eficiência","Acompanhar tendências em energia renovável"],ctaUrl:"https://www.fenasucro.com.br",dataStatus:"unverified" },
];

export const segments = ["Metalurgia", "Plástico", "Têxtil", "Moveleiro", "Máquinas", "Automotivo", "Químico", "Alimentos", "Energia", "Agronegócio"];
export const segmentProfiles: SegmentProfile[] = [
  {name:"Metalurgia",slug:"metalurgia",image:"/images/industrial/aco-fundicao.png",imageAlt:"Produção siderúrgica e metalurgia",articleCount:12},
  {name:"Plástico",slug:"plastico",image:"/images/industrial/segmento-plastico.png",imageAlt:"Linha industrial de extrusão de plástico",articleCount:15},
  {name:"Têxtil",slug:"textil",image:"/images/industrial/segmento-textil.png",imageAlt:"Maquinário de produção têxtil",articleCount:18},
  {name:"Moveleiro",slug:"moveleiro",image:"/images/industrial/segmento-moveleiro.png",imageAlt:"Fábrica de móveis com máquina CNC",articleCount:21},
  {name:"Máquinas",slug:"maquinas",image:"/images/industrial/robotica-fabrica.png",imageAlt:"Máquinas e automação industrial",articleCount:24},
  {name:"Automotivo",slug:"automotivo",image:"/images/industrial/robotica-fabrica.png",imageAlt:"Linha robotizada de componentes automotivos",articleCount:27},
  {name:"Químico",slug:"quimico",image:"/images/industrial/segmento-quimico.png",imageAlt:"Processo químico industrial com tanques",articleCount:30},
  {name:"Alimentos",slug:"alimentos",image:"/images/industrial/segmento-alimentos.png",imageAlt:"Linha industrial de produção de alimentos",articleCount:33},
  {name:"Energia",slug:"energia",image:"/images/industrial/segmento-energia.png",imageAlt:"Usina solar e infraestrutura elétrica",articleCount:36},
  {name:"Agronegócio",slug:"agronegocio",image:"/images/industrial/segmento-agronegocio.png",imageAlt:"Máquinas agrícolas e silos industriais",articleCount:39},
];
