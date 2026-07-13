"use client";

import { useState } from "react";
import { withBasePath } from "@/lib/paths";

export type SaveState = "idle" | "saving" | "success" | "error";

export function useConfigEditor<T>(initial: T, endpoint: string) {
  const [data, setData] = useState(initial);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("Alterações ainda não salvas");

  async function save() {
    setState("saving");
    setMessage("Salvando configurações...");
    try {
      const response = await fetch(withBasePath(endpoint), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao salvar");
      setData(body);
      setState("success");
      setMessage("Alterações salvas e publicadas no portal.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Falha ao salvar");
    }
  }

  function changed(next: T) {
    setData(next);
    setState("idle");
    setMessage("Alterações ainda não salvas");
  }

  return { data, setData: changed, state, message, save };
}
