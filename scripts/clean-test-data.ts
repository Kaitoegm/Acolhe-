import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { db } from "../src/lib/server/db";
import {
  planTestCleanup,
  executeTestCleanup,
} from "../src/lib/maintenance/test-data";
async function main() {
  if (!process.env.DATABASE_URL?.startsWith("file:"))
    throw new Error("Esta ferramenta de limpeza aceita apenas o SQLite local.");
  const plan = await planTestCleanup(db);
  console.log(JSON.stringify(plan, null, 2));
  if (!process.argv.includes("--apply")) {
    console.log(
      "Prévia somente. Use --apply para executar a limpeza autorizada.",
    );
    return;
  }
  if (!Object.values(plan.summary).some(Boolean)) {
    console.log("Nenhum resíduo automatizado encontrado.");
    return;
  }
  const root = resolve(".");
  const folder = resolve(
    ".backups",
    "test-cleanup-" + new Date().toISOString().replace(/[:.]/g, "-"),
  );
  if (!folder.startsWith(root + sep))
    throw new Error("Destino de backup fora do projeto.");
  await mkdir(folder, { recursive: true });
  const backup = resolve(folder, "before-cleanup.db");
  await db.$executeRawUnsafe(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  const originals = await db.clinicalCase.findMany({
    where: { slug: { in: ["gestante", "hipertenso", "idoso"] } },
    orderBy: { id: "asc" },
    include: { versions: { orderBy: { version: "asc" } } },
  });
  await writeFile(
    resolve(folder, "manifest.json"),
    JSON.stringify({ createdAt: new Date().toISOString(), plan }, null, 2),
    "utf8",
  );
  const result = await db.$transaction(
    async (tx) => executeTestCleanup(tx, await planTestCleanup(tx)),
    { timeout: 30000 },
  );
  const after = await db.clinicalCase.findMany({
    where: { id: { in: originals.map((c) => c.id) } },
    orderBy: { id: "asc" },
    include: { versions: { orderBy: { version: "asc" } } },
  });
  if (JSON.stringify(originals) !== JSON.stringify(after))
    throw new Error(
      "Verificação dos casos originais divergiu. Consulte o backup.",
    );
  console.log(
    JSON.stringify(
      { removed: result, backup, originalCasesPreserved: after.length },
      null,
      2,
    ),
  );
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
