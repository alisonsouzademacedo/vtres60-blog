import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";

export async function requireAdmin() {
  return (await isAdminAuthenticated()) ? null : NextResponse.json({ error: "Não autorizado" }, { status: 401 });
}

export function invalidPayload(message = "Dados inválidos") {
  return NextResponse.json({ error: message }, { status: 400 });
}
