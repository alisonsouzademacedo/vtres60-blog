"use client";

import { FormEvent, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "@/components/ui/icons";
import { withBasePath } from "@/lib/paths";
import type { HomeSettings } from "@/types/admin";

export function NewsletterForm({ config }: { config: HomeSettings["newsletter"] }) {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(withBasePath("/api/leads"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name") || "",
        email: form.get("email"),
        company: form.get("company") || "",
        role: form.get("role") || "",
        phone: form.get("phone") || "",
        website: form.get("website") || "",
        consent: form.get("consent") === "on",
        source: "newsletter",
        interest: "Briefing Industrial",
        originPage: pathname,
      }),
    });
    const body = await response.json();
    if (!response.ok) {
      setState("error");
      setMessage(body.error || "Nao foi possivel concluir o cadastro.");
      return;
    }
    setState("success");
    setMessage(config.successMessage);
    event.currentTarget.reset();
  }

  const configured = new Set(config.fields.map((field) => field.name));
  return (
    <form onSubmit={submit}>
      <strong>Entre na lista do Briefing Industrial</strong>
      <p>Deixe seu contato para acompanhar o lançamento e as próximas atualizações.</p>
      <div aria-hidden="true" style={{ display: "none" }}>
        <label htmlFor="newsletter-website">Website</label>
        <input id="newsletter-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {!configured.has("name") && (
        <div>
          <label className="sr-only" htmlFor="newsletter-name">
            Nome
          </label>
          <input id="newsletter-name" name="name" placeholder="Seu nome" />
        </div>
      )}
      {!configured.has("company") && (
        <div>
          <label className="sr-only" htmlFor="newsletter-company">
            Empresa
          </label>
          <input id="newsletter-company" name="company" placeholder="Sua empresa" />
        </div>
      )}
      {config.fields.map((field) => (
        <div key={field.name}>
          <label className="sr-only" htmlFor={`newsletter-${field.name}`}>
            {field.label}
          </label>
          <input
            id={`newsletter-${field.name}`}
            name={field.name}
            type={field.type}
            placeholder={field.placeholder}
            required={field.required}
          />
        </div>
      ))}
      <label className="newsletter-consent">
        <input name="consent" type="checkbox" required />
        <span>
          Aceito que a VTRES60 guarde meu contato para me avisar quando o Briefing Industrial começar a ser enviado,
          conforme a <Link href="/privacidade">Política de Privacidade</Link>.
        </span>
      </label>
      <button type="submit" disabled={state === "loading"}>
        {state === "loading" ? "Enviando..." : config.buttonText}
        <ArrowRight size={15} />
      </button>
      {message ? (
        <small role="status" data-state={state}>
          {message}
        </small>
      ) : (
        <small>Sem spam. Seus dados não são compartilhados com terceiros.</small>
      )}
    </form>
  );
}
