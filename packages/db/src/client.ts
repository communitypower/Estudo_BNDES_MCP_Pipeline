/**
 * Cliente de banco de dados — PostgreSQL + Drizzle ORM + pgvector.
 *
 * Expõe:
 *   db       — instância do Drizzle pronta para uso
 *   pool     — pool pg subjacente (para queries SQL raw com pgvector)
 *   sql      — tagged template para SQL parametrizado seguro
 *   cosine   — helper tipado para busca semântica por similaridade cosseno
 */

import { drizzle }    from "drizzle-orm/node-postgres";
import { sql }        from "drizzle-orm";
import { Pool }       from "pg";
import * as documents from "./schema/documents.js";
import * as shipyards from "./schema/shipyards.js";

// ─── conexão ─────────────────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não definido — configure .env ou Railway Variables");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export const db = drizzle(pool, {
  schema: { ...documents, ...shipyards },
});

export { sql };

// ─── helper de busca semântica ────────────────────────────────────────────────

export interface SemanticSearchParams {
  embedding:    number[];          // vetor de query (1024 dims)
  topK?:        number;            // padrão 5
  minSimilarity?: number;          // padrão 0.70
  filterSource?: documents.Document["sourceType"] | "all";
}

export interface SemanticSearchResult {
  chunkId:      number;
  documentId:   string;
  title:        string;
  sourceType:   string;
  publicationYear: number | null;
  pageNumber:   number | null;
  sectionTitle: string | null;
  chunkText:    string;
  similarity:   number;
  abntAbbrev:   string | null;
  isAnonymized: number | null;
}

/**
 * Busca semântica por similaridade cosseno no corpus de chunks.
 * Usa o operador `<=>` do pgvector (distância cosseno: 0 = idêntico, 2 = oposto).
 * Similaridade = 1 - distância.
 */
export async function cosineSearch(
  params: SemanticSearchParams
): Promise<SemanticSearchResult[]> {
  const {
    embedding,
    topK         = 5,
    minSimilarity = 0.70,
    filterSource  = "all",
  } = params;

  const vectorLiteral = `[${embedding.join(",")}]`;

  // SQL raw necessário para o operador <=> do pgvector
  const query = `
    SELECT
      c.id                  AS "chunkId",
      c.document_id         AS "documentId",
      d.title,
      d.source_type         AS "sourceType",
      d.publication_year    AS "publicationYear",
      c.page_number         AS "pageNumber",
      c.section_title       AS "sectionTitle",
      c.chunk_text          AS "chunkText",
      ROUND(
        CAST(1 - (c.embedding <=> $1::vector) AS NUMERIC), 4
      )                     AS similarity,
      d.abnt_abbrev         AS "abntAbbrev",
      d.is_anonymized       AS "isAnonymized"
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE
      ($2::text = 'all' OR d.source_type::text = $2::text)
      AND c.embedding IS NOT NULL
      AND 1 - (c.embedding <=> $1::vector) >= $3
    ORDER BY c.embedding <=> $1::vector
    LIMIT $4
  `;

  const result = await pool.query<SemanticSearchResult>(query, [
    vectorLiteral,
    filterSource,
    minSimilarity,
    topK,
  ]);

  // Força similaridade para number (pg devolve string para DECIMAL)
  return result.rows.map((r) => ({
    ...r,
    similarity: parseFloat(r.similarity as unknown as string),
  }));
}

// ─── migração do índice HNSW (executar uma vez após popular a tabela) ─────────

/**
 * Cria índice HNSW para busca aproximada eficiente.
 * Executar após ingestão completa dos documentos.
 * ef_construction=64, m=16 são valores adequados para ~100k chunks.
 */
export async function createHNSWIndex(): Promise<void> {
  await pool.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chunks_embedding_hnsw
    ON document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);
  console.log("✓ Índice HNSW criado em document_chunks.embedding");
}
