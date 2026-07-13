export interface ManagedSegment {
  id:string;name:string;slug:string;description:string;image:string;imageAlt:string;icon:string;
  articleCount:number;order:number;showOnHome:boolean;metaTitle:string;metaDescription:string;
  createdAt:string;updatedAt:string;
}
export type EventStatus="active"|"inactive";
export interface ManagedEvent {
  id:string;name:string;slug:string;mainImage:string;imageAlt:string;additionalImages:string[];
  startDate:string;endDate:string;month:string;city:string;state:string;venue:string;address:string;
  segment:string;expectedAudience:string;exhibitors:string;description:string;whyFollow:string[];
  opportunities:string[];officialUrl:string;ctaLabel:string;status:EventStatus;showOnHome:boolean;
  displayOrder:number;relatedEventIds:string[];dataStatus:"demonstrativo"|"confirmado";
  createdAt:string;updatedAt:string;
}
export type MediaType="logos"|"news"|"articles"|"events"|"segments"|"open-graph"|"general";
export interface MediaAsset { id:string;filename:string;url:string;altText:string;type:MediaType;mimeType:string;size:number;createdAt:string;updatedAt:string }
export interface Lead { id:string;name:string;email:string;company:string;role:string;phone:string;source:string;createdAt:string;interest:string;originPage:string }
export interface AdminLog { id:string;action:string;createdAt:string;module:string;description:string }
export interface BackupPayload { version:1;exportedAt:string;data:Record<string,unknown> }
