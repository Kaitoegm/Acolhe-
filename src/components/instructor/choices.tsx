"use client";
import { useId, useState } from "react";
import type { CatalogItem } from "@/lib/contracts";
export const riskOptions = [
  { code: "NON_ACUTE", label: "Não aguda" },
  { code: "LOW", label: "Aguda · baixa prioridade" },
  { code: "MEDIUM", label: "Aguda · prioridade intermediária" },
  { code: "HIGH", label: "Aguda · alta prioridade" },
];
export const outcomeOptions = [
  { code: "RELEASE", label: "Liberar cidadão" },
  { code: "REFER", label: "Encaminhar para atendimento" },
];
export function Choices({
  label,
  options,
  value,
  onChange,
  search = false,
}: {
  label: string;
  options: CatalogItem[];
  value: string[];
  onChange: (v: string[]) => void;
  search?: boolean;
}) {
  const [query, setQuery] = useState("");
  const id = useId();
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const shown = options.filter(
    (o) =>
      !query || normalize(o.label + " " + o.code).includes(normalize(query)),
  );
  return (
    <fieldset className="instructor-choices">
      <legend>{label}</legend>
      {search && (
        <label htmlFor={id}>
          Buscar opção
          <input
            id={id}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite o nome ou código"
          />
        </label>
      )}
      <div className={search ? "choice-scroll" : "choice-options"}>
        {shown.map((o) => (
          <label className="checkbox-label" key={o.code}>
            <input
              type="checkbox"
              checked={value.includes(o.code)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, o.code]
                    : value.filter((v) => v !== o.code),
                )
              }
            />
            <span>
              {o.label}
              {search && <small>{o.code}</small>}
            </span>
          </label>
        ))}
        {!shown.length && <p>Nenhuma opção encontrada.</p>}
      </div>
      {value
        .filter((v) => !options.some((o) => o.code === v))
        .map((v) => (
          <p key={v}>
            Código indisponível: {v}{" "}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== v))}
            >
              Remover código
            </button>
          </p>
        ))}
    </fieldset>
  );
}
