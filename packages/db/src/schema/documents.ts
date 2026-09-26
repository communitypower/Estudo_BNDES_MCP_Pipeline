/**
 * Schema de documentos e chunks com suporte a pgvector.
 *
 * Cada documento do RAG base é fragmentado em chunks sobrepostos
 * (chunk_text) e cada chunk recebe um embedding de 1024 dimensões
 * gerado pelo modelo voyage-large-2.
 *
 * A busca semântica opera sobre a coluna `embedding` usando o operador
 * de distância cosseno do pgvector (<=>), exponenciando por índice HNSW.
 */

import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
  customType,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── tipo personalizado para pgvector ────────────────────────────────────────
// Drizzle não tem suporte nativo a vector ainda; usamos customType.

export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1024)"; // voyage-large-2 produz embeddings de 1024 dims
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    // pgvector devolve string no formato "[0.1,0.2,...]"
    return JSON.parse(value);
  },
});

// ─── enums ────────────────────────────────────────────────────────────────────

export const sourceTypeEnum = pgEnum("source_type", [
  "coppe_ufrj",
  "geipot",
  "ipea",
  "bndes_proposta",
  "wbs_evm",
  "consultoria",  // relatório anonimizado 2018
  "other",
]);

export const docTypeEnum = pgEnum("doc_type", [
  "volume",
  "report",
  "technical_note",
  "proposal",
  "benchmarking",
  "dissertation",
]);

// ─── tabela de documentos ─────────────────────────────────────────────────────

export const documents = pgTable("documents", {
  id:              varchar("id", { length: 64 }).primaryKey(),
  title:           text("title").notNull(),
  sourceType:      sourceTypeEnum("source_type").notNull(),
  docType:         docTypeEnum("doc_type").notNull(),
  publicationYear: integer("publication_year"),
  authors:         text("authors"),           // JSON array serializado
  institution:     text("institution"),
  filePath:        text("file_path"),          // caminho em /docs/*.md
  pageCount:       integer("page_count"),
  wordCount:       integer("word_count"),
  // Metadados ABNT para citação automática
  abntEntry:       text("abnt_entry"),         // entrada ABNT completa pré-formatada
  abntAbbrev:      varchar("abnt_abbrev", { length: 64 }), // ex: "COPPE/UFRJ, 2007"
  isAnonymized:    integer("is_anonymized").default(0), // 1 = relatório 2018
  createdAt:       timestamp("created_at").defaultNow(),
});

// ─── tabela de chunks ─────────────────────────────────────────────────────────

export const documentChunks = pgTable("document_chunks", {
  id:           serial("id").primaryKey(),
  documentId:   varchar("document_id", { length: 64 })
                  .notNull()
                  .references(() => documents.id, { onDelete: "cascade" }),
  chunkIndex:   integer("chunk_index").notNull(),
  chunkText:    text("chunk_text").notNull(),
  pageNumber:   integer("page_number"),
  sectionTitle: text("section_title"),
  wordCount:    integer("word_count"),
  // O vetor é gerado e inserido pelo script de ingestão
  embedding:    vector("embedding"),
  createdAt:    timestamp("created_at").defaultNow(),
});

// ─── tipos TypeScript inferidos ───────────────────────────────────────────────

export type Document      = typeof documents.$inferSelect;
export type NewDocument   = typeof documents.$inferInsert;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type NewDocumentChunk = typeof documentChunks.$inferInsert;
