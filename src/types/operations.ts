export interface ManagedSegment {
  id:string;name:string;slug:string;description:string;image:string;imageAlt:string;icon:string;
  articleCount:number;order:number;showOnHome:boolean;metaTitle:string;metaDescription:string;
  createdAt:string;updatedAt:string;
}
/**
 * Fase 8C (secao 15) — modelo hibrido: descoberta -> candidato -> validacao
 * contra fonte oficial -> revisao administrativa -> publicacao ->
 * atualizacao -> arquivamento automatico. "demonstrativo"/"confirmado" e
 * "active"/"inactive" (Fase 8A/8B) eram um estado binario que nao
 * distinguia "nunca verificado" de "verificado e no ar" de "verificado mas
 * encerrado" — por isso a troca para os 5 status abaixo.
 */
export type EventStatus="candidate"|"verified"|"published"|"archived"|"cancelled";
export type EventDataStatus="official_verified"|"manual_verified"|"unverified";
export interface ManagedEvent {
  id:string;name:string;slug:string;mainImage:string;imageAlt:string;additionalImages:string[];
  startDate:string;endDate:string;month:string;city:string;state:string;venue:string;address:string;
  segment:string;expectedAudience:string;exhibitors:string;description:string;whyFollow:string[];
  opportunities:string[];officialUrl:string;ctaLabel:string;status:EventStatus;showOnHome:boolean;
  displayOrder:number;relatedEventIds:string[];dataStatus:EventDataStatus;
  verifiedAt?:string;publishedAt?:string;archivedAt?:string;
  createdAt:string;updatedAt:string;
}
export type MediaType="logos"|"news"|"articles"|"events"|"segments"|"open-graph"|"general";
export interface MediaAsset { id:string;filename:string;url:string;altText:string;type:MediaType;mimeType:string;size:number;createdAt:string;updatedAt:string }
export interface Lead { id:string;name:string;email:string;company:string;role:string;phone:string;source:string;createdAt:string;interest:string;originPage:string }
export interface AdminLog { id:string;action:string;createdAt:string;module:string;description:string }
export interface BackupPayload { version:1;exportedAt:string;data:Record<string,unknown> }
