export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public resetsAt?: string,
    public retryAfter?: string | null,
    public issues?: import("./evaluation/publication").PublicationIssue[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  const data = await response
    .json()
    .catch(() => ({ error: "Resposta inválida do servidor." }));
  if (!response.ok)
    throw new ApiError(
      data.error || "Não foi possível concluir a operação.",
      response.status,
      data.code,
      data.resetsAt,
      response.headers.get("Retry-After"),
      data.issues,
    );
  return data as T;
}
export const post = <T>(url: string, data: unknown) =>
  api<T>(url, { method: "POST", body: JSON.stringify(data) });
export const errorMessage = (error: unknown) => {
  if (error instanceof ApiError && error.status === 429 && error.resetsAt) {
    return `${error.message} Renovação em ${new Date(error.resetsAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (São Paulo).`;
  }
  return error instanceof Error ? error.message : "Ocorreu um erro inesperado.";
};
