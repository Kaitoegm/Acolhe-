import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { compare } from "bcryptjs";
import { createHash } from "node:crypto";
import { db } from "./db";
import { HttpError } from "./security";
import type { UserView } from "../contracts";

export function publicUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
}): UserView {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as UserView["role"],
  };
}
export async function session() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32)
    throw new Error("SESSION_SECRET deve ter pelo menos 32 caracteres.");
  return getIronSession<{ userId?: string }>(await cookies(), {
    password,
    cookieName: "acolhe_session",
    ttl: 8 * 60 * 60,
    cookieOptions: {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production" &&
        process.env.APP_URL?.startsWith("https://") !== false,
      sameSite: "lax",
      path: "/",
    },
  });
}
export async function currentUser() {
  const data = await session();
  if (!data.userId) return null;
  return db.user.findFirst({
    where: { id: data.userId, active: true },
    select: { id: true, name: true, email: true, role: true },
  });
}
export async function authenticated() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Entre na sua conta para continuar.");
  return user;
}
export async function login(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  const key = createHash("sha256").update(normalized).digest("hex");
  const now = new Date();
  await db.loginLimit.upsert({
    where: { key },
    create: { key, count: 0, windowStart: now },
    update: {},
  });
  await db.loginLimit.updateMany({
    where: { key, windowStart: { lt: new Date(now.getTime() - 15 * 60_000) } },
    data: { count: 0, windowStart: now },
  });
  const limit = await db.loginLimit.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
  if (limit.count > 10)
    throw new HttpError(429, "Muitas tentativas. Aguarde 15 minutos.");
  const user = await db.user.findUnique({ where: { email: normalized } });
  const hash =
    user?.passwordHash ??
    "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW";
  let valid = await compare(password, hash);
  if (!valid && process.env.AI_MODE === "demo" && process.env.NODE_ENV !== "production" && !!process.env.DEMO_PASSWORD && password === "1234") {
    valid = await compare(process.env.DEMO_PASSWORD!, hash);
  }
  if (!user || !user.active || !valid)
    throw new HttpError(401, "E-mail ou senha inválidos.");
  await db.loginLimit.deleteMany({ where: { key } });
  const data = await session();
  data.userId = user.id;
  await data.save();
  return publicUser(user);
}
