"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { withBasePath } from "@/lib/paths";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch(withBasePath("/api/admin/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Não foi possível entrar.");
      setLoading(false);
      return;
    }
    router.push(params.get("next") || "/admin");
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <label className="admin-label" htmlFor="admin-password">
        Senha administrativa
      </label>
      <input
        id="admin-password"
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        required
        autoFocus
        placeholder="Digite sua senha"
      />
      {error && (
        <span className="admin-error" role="alert">
          {error}
        </span>
      )}
      <button className="admin-primary-button" disabled={loading}>
        {loading ? "Validando..." : "Acessar painel"}
        <ArrowRight size={15} />
      </button>
    </form>
  );
}
