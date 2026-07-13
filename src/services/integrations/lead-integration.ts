import type { Lead } from "@/types/operations";
export interface LeadIntegration { name:string;enabled:boolean;send(lead:Lead):Promise<void> }
class LocalOnlyIntegration implements LeadIntegration { name="local";enabled=true;async send(){return} }
// Futuras implementações: RD Station, HubSpot, Mailchimp, Brevo, Sheets e Webhook.
export const leadIntegrations:LeadIntegration[]=[new LocalOnlyIntegration()];
