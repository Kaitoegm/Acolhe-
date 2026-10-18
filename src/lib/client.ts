export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers }, cache: 'no-store' });
  const data = await response.json().catch(() => ({ error: 'Resposta inválida do servidor.' }));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data as T;
}
export const post = <T>(url: string, data: unknown) => api<T>(url, { method: 'POST', body: JSON.stringify(data) });
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
