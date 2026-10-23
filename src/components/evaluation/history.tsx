"use client";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client";
import type { Page } from "@/lib/contracts";
type Action = {
  id: string;
  findingId: string;
  state: string;
  authorId: string;
  createdAt: string;
};
export function RevisionHistory({ attemptId }: { attemptId: string }) {
  const [rows, setRows] = useState<Action[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  async function load(next?: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api<Page<Action>>(
        "/api/attempts/" +
          attemptId +
          "/revision-actions" +
          (next ? "?cursor=" + encodeURIComponent(next) : ""),
      );
      setRows((old) => [
        ...new Map(
          [...(next ? old : []), ...result.items].map((r) => [r.id, r]),
        ).values(),
      ]);
      setCursor(result.nextCursor);
      setLoaded(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className="revision-history"
      onToggle={(e) => {
        if (e.currentTarget.open && !loaded && !busy) void load();
      }}
    >
      <summary>Histórico de decisões do aluno</summary>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loaded && !rows.length && (
        <p className="muted small">Ainda não há decisões registradas.</p>
      )}
      <ol>
        {rows.map((row) => (
          <li key={row.id}>
            <strong>
              {{
                accepted: "Sugestão aceita",
                rejected: "Texto mantido",
                pending: "Decisão desfeita",
              }[row.state] ?? row.state}
            </strong>
            <span>
              {row.findingId} ·{" "}
              {new Date(row.createdAt).toLocaleString("pt-BR")}
            </span>
          </li>
        ))}
      </ol>
      {cursor && (
        <button type="button" disabled={busy} onClick={() => void load(cursor)}>
          Carregar decisões anteriores
        </button>
      )}
      {loaded && (
        <button type="button" disabled={busy} onClick={() => void load()}>
          Atualizar histórico
        </button>
      )}
    </details>
  );
}
