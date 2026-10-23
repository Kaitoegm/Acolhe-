import "dotenv/config";
import { randomUUID, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { hash } from "bcryptjs";
import { db } from "../src/lib/server/db";
import { demoCases } from "../src/lib/domain";
import { EMPTY_DRAFT } from "../src/lib/contracts";
import type { Page, QueueItem } from "../src/lib/contracts";

const prefix = `load-${randomUUID()}`;
const teacher = `${prefix}-teacher`,
  classId = `${prefix}-class`,
  caseId = `${prefix}-case`,
  versionId = `${prefix}-version`;
const base = process.env.APP_URL || "http://localhost:3000";
const rows = 10000,
  clients = 20;
const users = Array.from(
  { length: rows },
  (_, i) => `${prefix}-${String(i).padStart(5, "0")}`,
);
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
async function main() {
  if (
    !process.env.DATABASE_URL?.startsWith("file:") &&
    process.env.LOAD_ALLOW_POSTGRES !== "true"
  )
    throw new Error(
      "Teste de carga permitido no banco local; PostgreSQL de homologação exige LOAD_ALLOW_POSTGRES=true.",
    );
  const password = randomBytes(24).toString("hex");
  await db.user.create({
    data: {
      id: teacher,
      email: `${teacher}@example.test`,
      name: "Instrutor carga",
      passwordHash: await hash(password, 12),
      role: "INSTRUCTOR",
    },
  });
  await db.class.create({
    data: { id: classId, name: prefix, instructorId: teacher },
  });
  const source = demoCases[0];
  await db.clinicalCase.create({
    data: {
      id: caseId,
      ownerId: teacher,
      currentStatus: "PUBLISHED",
      versions: {
        create: {
          id: versionId,
          version: 1,
          title: source.title,
          description: source.description,
          patient: json(source.patient),
          rubric: json(source.rubric),
          status: "PUBLISHED",
        },
      },
    },
  });
  for (let start = 0; start < rows; start += 500) {
    const part = users.slice(start, start + 500);
    await db.user.createMany({
      data: part.map((id) => ({
        id,
        email: `${id}@example.test`,
        name: id,
        passwordHash: "unused",
        role: "STUDENT",
      })),
    });
    await db.membership.createMany({
      data: part.map((userId) => ({ userId, classId })),
    });
    await db.simulation.createMany({
      data: part.map((studentId, index) => ({
        id: `${studentId}-sim`,
        studentId,
        classId,
        caseId,
        caseVersionId: versionId,
        patientName: `Paciente ${start + index}`,
        patientNameSearch: `paciente ${start + index}`,
        riskRank: (start + index) % 5,
        draft: json(EMPTY_DRAFT),
        createdAt: new Date("2026-01-01T00:00:00Z"),
      })),
    });
  }
  const login = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${teacher}@example.test`, password }),
  });
  if (!login.ok) throw new Error(`Login do teste falhou (${login.status}).`);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Sessão do teste não recebida.");
  const timings: number[] = [],
    bytes: number[] = [];
  async function page(cursor?: string): Promise<Page<QueueItem>> {
    const begin = performance.now();
    const response = await fetch(
      `${base}/api/instructor/simulations?limit=100${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`,
      { headers: { Cookie: cookie! } },
    );
    const raw = await response.text();
    if (!response.ok)
      throw new Error(`Leitura de carga falhou (${response.status}).`);
    const data = JSON.parse(raw) as Page<QueueItem>;
    if (data.items.length > 100 || /"snapshot"|"rubric"|"messages"/.test(raw))
      throw new Error("Página excedeu limite ou expôs histórico.");
    timings.push(performance.now() - begin);
    bytes.push(Buffer.byteLength(raw));
    return data;
  }
  const start = performance.now();
  await Promise.all(
    Array.from({ length: clients }, async () => {
      let cursor: string | undefined;
      for (let n = 0; n < 5; n++) {
        const result = await page(cursor);
        cursor = result.nextCursor ?? undefined;
      }
    }),
  );
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const result = await page(cursor);
    for (const item of result.items) {
      if (seen.has(item.id)) throw new Error("Registro duplicado.");
      seen.add(item.id);
    }
    cursor = result.nextCursor ?? undefined;
  } while (cursor);
  if (seen.size !== rows)
    throw new Error(`Esperados ${rows}, recebidos ${seen.size}.`);
  timings.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      database: process.env.DATABASE_URL?.startsWith("file:")
        ? "SQLite"
        : "PostgreSQL",
      records: rows,
      concurrentClients: clients,
      requests: timings.length,
      p50ms: Math.round(timings[Math.floor(timings.length * 0.5)]),
      p95ms: Math.round(timings[Math.floor(timings.length * 0.95)]),
      maxPayloadBytes: Math.max(...bytes),
      elapsedSeconds: Math.round((performance.now() - start) / 100) / 10,
      verifiedUniqueRecords: seen.size,
    }),
  );
}
async function cleanup() {
  await db.simulation.deleteMany({ where: { classId } });
  await db.caseVersion.deleteMany({ where: { caseId } });
  await db.clinicalCase.deleteMany({ where: { id: caseId } });
  await db.membership.deleteMany({ where: { classId } });
  await db.class.deleteMany({ where: { id: classId } });
  await db.user.deleteMany({ where: { id: { in: [teacher, ...users] } } });
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
  });
