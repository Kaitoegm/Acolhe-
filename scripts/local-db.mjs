import {
  readFileSync,
  writeFileSync,
  existsSync,
  openSync,
  closeSync,
  mkdirSync,
} from "node:fs";
import { resolve, dirname, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

// Local-only setup. Never overwrites existing credentials or touches remote databases.
if (!existsSync(".env")) {
  writeFileSync(
    ".env",
    `DATABASE_URL="file:./dev.db"\nSESSION_SECRET="${randomBytes(48).toString("hex")}"\nAI_MODE="demo"\nALLOW_DEMO_CASES="true"\nDEMO_PASSWORD="Acolhe+2026!"\nAPP_URL="http://localhost:3000"\n`,
  );
}
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });
if (!process.env.DATABASE_URL?.startsWith("file:")) {
  throw new Error(
    "db:local aceita apenas DATABASE_URL=file:...; não altera um banco PostgreSQL. Use db:generate e migrations para implantação.",
  );
}
const schema = readFileSync("prisma/schema.prisma", "utf8");
writeFileSync(
  "prisma/local.prisma",
  schema.replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"'),
);
// Prisma's Windows engine can fail with an empty diagnostic when the SQLite file
// does not exist. Create an empty file without truncating an existing database.
const localPath = resolve(
  "prisma",
  process.env.DATABASE_URL.slice(5).split("?")[0],
);
if (!localPath.startsWith(resolve(".") + sep))
  throw new Error("O banco local deve estar dentro da pasta do projeto.");
mkdirSync(dirname(localPath), { recursive: true });
closeSync(openSync(localPath, "a"));
for (const args of [
  ["generate", "--schema", "prisma/local.prisma"],
  ["db", "push", "--schema", "prisma/local.prisma"],
]) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    { stdio: "inherit", env: process.env },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  "Banco local pronto. Execute npm run db:seed para criar a turma demonstrativa.",
);
