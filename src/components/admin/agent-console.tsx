"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { History, ListPlus, Terminal, Zap } from "lucide-react";
import { withBasePath } from "@/lib/paths";
import { LogList } from "@/components/admin/log-list";
import type { AdminLog } from "@/types/operations";

interface LogEntry {
  id: number;
  text: string;
  kind: "step" | "error" | "done";
}

interface StreamEvent {
  currentStep?: string;
  error?: string;
  done?: boolean;
}

export function AgentConsole({ history }: { history: AdminLog[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<"console" | "historico">("console");
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [queueState, setQueueState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [queueMessage, setQueueMessage] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  function appendLog(text: string, kind: LogEntry["kind"] = "step") {
    setLogs((prev) => [...prev, { id: nextId.current++, text, kind }]);
    requestAnimationFrame(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    });
  }

  // Le a resposta como stream manualmente (fetch + ReadableStream) em vez
  // de EventSource nativo: EventSource so faz GET e nao permite enviar
  // corpo/URL no request, mas aqui as vezes precisamos enviar a URL da
  // noticia no body de um POST (e sempre precisamos do POST para o botao
  // de forcar execucao, que nao envia URL nenhuma).
  async function run(sourceUrl?: string) {
    if (running) return;

    setTab("console");
    setRunning(true);
    setLogs([]);
    appendLog(sourceUrl ? `Gerando notícia a partir do link: ${sourceUrl}` : "Forçando execução — buscando notícia via GNews...");

    try {
      const response = await fetch(withBasePath("/api/admin/agent/stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl }),
      });

      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}) as { error?: string });
        appendLog(body.error ?? "Não foi possível iniciar o agente.", "error");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.trim();
          if (!line.startsWith("data:")) continue;
          const event = JSON.parse(line.slice(5).trim()) as StreamEvent;
          if (event.error) appendLog(event.error, "error");
          else if (event.done) appendLog("Execução finalizada.", "done");
          else if (event.currentStep) appendLog(event.currentStep);
        }
      }
    } catch {
      appendLog("Conexão com o agente foi interrompida.", "error");
    } finally {
      setRunning(false);
      // A execucao grava um registro em operationsRepository (modulo
      // "agente"), mas o `history` desta pagina veio do carregamento
      // inicial do Server Component — sem isso, a aba "Historico de
      // execucoes" fica presa nos dados de quando a pagina abriu.
      router.refresh();
    }
  }

  async function addToQueue() {
    const sourceUrl = url.trim();
    if (!sourceUrl || queueState === "loading") return;

    setQueueState("loading");
    setQueueMessage("Adicionando à fila...");
    try {
      const response = await fetch(withBasePath("/api/admin/agent/queue"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUrl }),
      });
      const body = await response.json().catch(() => ({}) as { error?: string });
      if (!response.ok) {
        setQueueState("error");
        setQueueMessage(body.error ?? "Não foi possível adicionar à fila.");
        return;
      }
      setQueueState("done");
      setQueueMessage("Adicionado à fila. O agente processará no próximo horário agendado (05h ou 17h).");
      setUrl("");
      router.refresh();
    } catch {
      setQueueState("error");
      setQueueMessage("Conexão com o servidor foi interrompida.");
    }
  }

  return (
    <section className="admin-card">
      <header>
        <div>
          <h2>Disparar o agente</h2>
          <p>Cole o link de uma notícia para enfileirar ou forçar a geração agora, ou deixe o agente buscar a pauta sozinho via GNews.</p>
        </div>
      </header>

      <div className="admin-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "console"} className={tab === "console" ? "active" : ""} onClick={() => setTab("console")}>
          <Terminal size={13} />
          Console
        </button>
        <button type="button" role="tab" aria-selected={tab === "historico"} className={tab === "historico" ? "active" : ""} onClick={() => setTab("historico")}>
          <History size={13} />
          Histórico de execuções
        </button>
      </div>

      {tab === "console" ? (
        <div className="admin-agent-console">
          <div className="admin-fields">
            <div className="admin-field admin-field-full">
              <label htmlFor="agent-url">URL da notícia</label>
              <input
                id="agent-url"
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setQueueState("idle");
                }}
                disabled={running}
              />
            </div>
          </div>

          <div className="admin-agent-actions">
            <button className="admin-secondary-button" onClick={addToQueue} disabled={running || queueState === "loading" || !url.trim()}>
              <ListPlus size={14} />
              {queueState === "loading" ? "Adicionando..." : "Adicionar à fila"}
            </button>
            <button className="admin-secondary-button" onClick={() => run(url.trim())} disabled={running || !url.trim()}>
              <Zap size={14} />
              Gerar notícia deste link agora
            </button>
            <button className="admin-primary-button admin-agent-force" onClick={() => run()} disabled={running}>
              <Zap size={14} />
              {running ? "Executando..." : "Gerar notícia agora (forçar execução)"}
            </button>
          </div>

          {queueMessage && (
            <p className={queueState === "error" ? "admin-terminal-line admin-terminal-error" : "admin-terminal-line admin-terminal-done"}>
              {queueMessage}
            </p>
          )}

          <div className="admin-terminal" ref={logRef}>
            {logs.length === 0 && <p className="admin-terminal-empty">Aguardando execução...</p>}
            {logs.map((log) => (
              <p
                key={log.id}
                className={log.kind === "step" ? "admin-terminal-line" : `admin-terminal-line admin-terminal-${log.kind}`}
              >
                {log.text}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <div className="admin-agent-history">
          <LogList items={history} />
        </div>
      )}
    </section>
  );
}
