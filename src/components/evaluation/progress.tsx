"use client";
const steps = [
  ["QUEUED", "Aguardando análise"],
  ["CRITERIA", "Conferindo critérios"],
  ["LANGUAGE", "Revisando escrita"],
  ["VALIDATING", "Validando sugestões"],
  ["COMPLETED", "Revisão disponível"],
];
export function EvaluationProgress({ stage = "QUEUED" }: { stage?: string }) {
  const current = Math.max(
    0,
    steps.findIndex(([key]) => key === stage),
  );
  return (
    <div className="evaluation-progress" role="status" aria-live="polite">
      <strong>{steps[current][1]}</strong>
      <ol aria-label="Etapas da análise">
        {steps.map(([key, label], index) => (
          <li
            key={key}
            className={
              index < current ? "done" : index === current ? "current" : ""
            }
            aria-current={index === current ? "step" : undefined}
          >
            <span aria-hidden="true">{index < current ? "✓" : index + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <p className="muted small">
        Sua tentativa está salva. O andamento acompanha o serviço de análise.
      </p>
    </div>
  );
}
