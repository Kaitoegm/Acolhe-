import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./security";

export type Keys = {
  id: string;
  createdAt?: string;
  number?: number;
  riskRank?: number;
};
export type Page<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};
export function pagination(
  request: Request,
  scope: unknown,
  allowed: string[] = [],
) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys())
    if (
      !["limit", "cursor", ...allowed].includes(key) ||
      params.getAll(key).length !== 1
    )
      throw new HttpError(400, "Parâmetro de consulta inválido.");
  const rawLimit = params.get("limit");
  if (rawLimit !== null && !/^[1-9]\d*$/.test(rawLimit))
    throw new HttpError(400, "Limite inválido.");
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  if (limit > 100 || !Number.isSafeInteger(limit))
    throw new HttpError(400, "Limite máximo de 100 itens.");
  const filters = Object.fromEntries(
    [...params.entries()]
      .filter(([k]) => k !== "cursor" && k !== "limit")
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const digest = createHash("sha256")
    .update(JSON.stringify([scope, filters]))
    .digest("hex");
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("SESSION_SECRET deve ter pelo menos 32 caracteres.");
  const sign = (value: string) =>
    createHmac("sha256", secret)
      .update("acolhe-pagination-v1:")
      .update(value)
      .digest("base64url");
  let after: Keys | undefined;
  const cursor = params.get("cursor");
  if (cursor !== null) {
    try {
      if (cursor.length > 2048) throw new Error();
      const pieces = cursor.split(".");
      if (pieces.length !== 2) throw new Error();
      const [payload, signature] = pieces;
      const expected = Buffer.from(sign(payload));
      const actual = Buffer.from(signature);
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw new Error();
      const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
      if (
        parsed.v !== 1 ||
        parsed.scope !== digest ||
        typeof parsed.keys?.id !== "string" ||
        !parsed.keys.id ||
        Object.keys(parsed.keys).some(
          (k) => !["id", "createdAt", "number", "riskRank"].includes(k),
        )
      )
        throw new Error();
      if (
        parsed.keys.createdAt !== undefined &&
        (typeof parsed.keys.createdAt !== "string" ||
          !Number.isFinite(Date.parse(parsed.keys.createdAt)))
      )
        throw new Error();
      if (
        parsed.keys.number !== undefined &&
        (!Number.isInteger(parsed.keys.number) || parsed.keys.number < 1)
      )
        throw new Error();
      if (
        parsed.keys.riskRank !== undefined &&
        (!Number.isInteger(parsed.keys.riskRank) ||
          parsed.keys.riskRank < 0 ||
          parsed.keys.riskRank > 4)
      )
        throw new Error();
      after = parsed.keys;
    } catch {
      throw new HttpError(400, "Cursor inválido para esta consulta.");
    }
  }
  return {
    limit,
    filters,
    after,
    page<T>(rows: T[], keys: (row: T) => Keys): Page<T> {
      const hasMore = rows.length > limit,
        items = rows.slice(0, limit);
      const payload = hasMore
        ? Buffer.from(
            JSON.stringify({
              v: 1,
              scope: digest,
              keys: keys(items[items.length - 1]),
            }),
          ).toString("base64url")
        : null;
      return {
        items,
        hasMore,
        nextCursor: payload ? `${payload}.${sign(payload)}` : null,
      };
    },
  };
}
export function keyset(
  after: Keys | undefined,
  ascending = false,
  risk = false,
  numbered = false,
) {
  if (!after) return {};
  const op = ascending ? "gt" : "lt";
  if (numbered) {
    if (after.number === undefined)
      throw new HttpError(400, "Cursor inválido.");
    return {
      OR: [
        { number: { [op]: after.number } },
        { number: after.number, id: { [op]: after.id } },
      ],
    };
  }
  if (!after.createdAt || (risk && after.riskRank === undefined))
    throw new HttpError(400, "Cursor inválido.");
  const date = new Date(after.createdAt);
  const dateKeys = [
    { createdAt: { [op]: date } },
    { createdAt: date, id: { [op]: after.id } },
  ];
  return risk
    ? {
        OR: [
          { riskRank: { gt: after.riskRank } },
          { riskRank: after.riskRank, OR: dateKeys },
        ],
      }
    : { OR: dateKeys };
}
