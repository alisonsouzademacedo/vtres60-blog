"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "@/lib/analytics-events";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import type { WhatsAppSettings } from "@/types/admin";

/**
 * CTA comercial "Falar com um especialista" (Fase 8B). Nao renderiza nada
 * quando o canal esta desabilitado ou sem numero configurado — nunca um
 * link quebrado. `label` alimenta o evento de analytics (whatsapp_click);
 * `children`, quando fornecido, controla o conteudo visual do link (ex:
 * label + icone), senao usa o proprio `label`.
 */
export function WhatsAppCTA({
  whatsapp,
  label,
  placement,
  className,
  children,
}: {
  whatsapp: WhatsAppSettings | undefined;
  label: string;
  placement: string;
  className?: string;
  children?: ReactNode;
}) {
  const pathname = usePathname();
  const url = buildWhatsAppUrl(whatsapp);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => trackEvent("whatsapp_click", { placement, page_path: pathname, cta_label: label })}
    >
      {children ?? label}
    </a>
  );
}
