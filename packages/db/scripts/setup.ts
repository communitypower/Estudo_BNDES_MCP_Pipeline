/**
 * Prepara o banco do bndes-naval-mcp: habilita o pgvector e aplica
 * packages/db/sql/schema.sql (idempotente).
 *
 * Uso: DATABASE_URL=... npm run db:setup
 * Em seguida: npm run ingest
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definido");
  process.exit(1);
}

const schemaSql = readFileSync(fileURLToPath(new URL("../sql/schema.sql", import.meta.url)), "utf-8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
  } catch (error) {
    throw new Error(
      "não foi possível habilitar o pgvector. No Railway, use um Postgres com pgvector " +
      `(template "pgvector") em vez do Postgres padrão. Detalhe: ${error instanceof Error ? error.message : error}`
    );
  }
  console.log("✓ extensão pgvector habilitada");

  await client.query(schemaSql);
  const { rows } = await client.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log(`✓ schema aplicado: ${rows.map((row) => row.table_name).join(", ")}`);
} catch (error) {
  console.error("✗", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
