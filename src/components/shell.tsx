"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartPulse, LogOut, GraduationCap, Building2 } from "lucide-react";
import { api, post } from "@/lib/client";
import type { UserView } from "@/lib/contracts";
export function Shell({
  children,
  onUser,
}: {
  children: React.ReactNode;
  onUser?: (user: UserView) => void;
}) {
  const [user, setUser] = useState<UserView | null>(null);
  const [mode, setMode] = useState("");
  const router = useRouter();
  useEffect(() => {
    api<{
      user: UserView | null;
      mode: string;
    }>("/api/session")
      .then((r) => {
        if (!r.user) {
          router.replace("/login");
          return;
        }
        setUser(r.user);
        setMode(r.mode);
        onUser?.(r.user);
      })
      .catch(() => router.replace("/login"));
  }, [router, onUser]);
  return (
    <>
      <header className="topbar">
        <Link className="brand" href="/">
          <HeartPulse size={31} />
          <span>
            <b>
              Acolhe<span className="brand-plus">+</span>
            </b>
            <small>Simulação de acolhimento</small>
          </span>
        </Link>
        <div className="header-right">
          <span className="unit">
            <Building2 size={16} /> UBS Poços de Caldas
          </span>
          {user?.role === "INSTRUCTOR" && (
            <Link href="/instrutor">Área do instrutor</Link>
          )}
          <span className="user-name">
            {user?.name || "Carregando…"}
            <small>
              {user?.role === "INSTRUCTOR" ? "Instrutor(a)" : "Aluno(a)"}
            </small>
          </span>
          <button
            className="icon-button"
            aria-label="Sair"
            onClick={async () => {
              await post("/api/logout", {});
              router.push("/login");
            }}
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>
      <div className="training">
        <GraduationCap size={17} />
        <strong>Ambiente de treinamento</strong>
        <span>Dados fictícios. Não utilizar para atendimento real.</span>
        {mode === "demo" && (
          <span className="demo-label">IA demonstrativa</span>
        )}
      </div>
      {children}
      <footer className="site-footer">
        Acolhe+ <span>Aprender a escutar. Praticar o cuidado.</span>
      </footer>
    </>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error" role="alert">
      {message}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <main className="page">
      <div className="skeleton" />
      <div className="skeleton wide" />
      <p role="status">Carregando atendimento…</p>
    </main>
  );
}
export const riskLabels: Record<string, string> = {
  NON_ACUTE: "Não aguda",
  LOW: "Baixa",
  MEDIUM: "Intermediária",
  HIGH: "Alta",
};
export const statusLabels: Record<string, string> = {
  WAITING: "Aguardando",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Finalizado",
  DRAFT: "Em atendimento",
  QUEUED: "Em fila",
  RUNNING: "Em avaliação",
  FAILED: "Falha na avaliação",
  SUBMITTED: "Em avaliação",
  EVALUATING: "Em avaliação",
  REVIEWED: "Avaliado",
};
