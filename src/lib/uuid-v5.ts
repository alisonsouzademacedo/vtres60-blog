import { createHash } from "node:crypto";

/**
 * UUID v5 (RFC 4122) — determinístico: mesmo (name, namespace) sempre produz
 * o mesmo UUID. Implementado sobre node:crypto (sem dependência nova — ver
 * Fase 9B.1, decisão registrada em docs/implementacao-fase9b1-supabase-dominios.md).
 *
 * `namespace` deve ser um UUID válido (qualquer versão). Bits de versão (5)
 * e variante (RFC 4122, "10xx") são forçados no resultado, como manda a RFC.
 */
export function uuidV5(name: string, namespace: string): string {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  if (namespaceBytes.length !== 16) throw new Error(`Namespace UUID inválido: "${namespace}"`);
  const nameBytes = Buffer.from(name, "utf8");
  const hash = createHash("sha1").update(Buffer.concat([namespaceBytes, nameBytes])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // versão 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
