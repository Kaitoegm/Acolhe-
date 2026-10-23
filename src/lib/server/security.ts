export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: Record<string, unknown>,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}
export type Identity = { id: string; role: string };
export function requireRole(user: Identity, role: string) {
  if (user.role !== role) throw new HttpError(403, "Acesso não permitido.");
}
export function simulationScope(user: Identity) {
  if (user.role === "STUDENT")
    return {
      studentId: user.id,
      class: { memberships: { some: { userId: user.id } } },
    };
  if (user.role === "INSTRUCTOR") return { class: { instructorId: user.id } };
  throw new HttpError(403, "Perfil não autorizado.");
}
export function assertOrigin(request: Request) {
  const expected = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : new URL(request.url).origin;
  if (request.headers.get("origin") !== expected)
    throw new HttpError(403, "Origem da solicitação não permitida.");
}
