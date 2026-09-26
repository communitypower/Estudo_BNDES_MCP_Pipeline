/**
 * Tool: search_corpus
 *
 * Busca semântica nos 19 documentos do RAG base do estudo BNDES.
 * Opera sobre embeddings pgvector via similaridade cosseno.
 *
 * Pipeline:
 *   query (string) → embedding (voyage-large-2) → cosineSearch (pgvector)
 *   → formatação estruturada para consumo pelos agentes
 */

import { z }                    from "zod";
import { generateQueryEmbedding } from "../embeddings.js";
import { cosineSearch }          from "../../../db/src/client.js";

// ─── schema de entrada ────────────────────────────────────────────────────────

export const searchCorpusSchema = z.object({
  query: z.string()
    .min(3)
    .max(512)
    .describe("Consulta em linguagem natural (português ou inglês)"),

  top_k: z.number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("Número de chunks a retornar (padrão 5; use 8–10 para panorama amplo)"),

  min_similarity: z.number()
    .min(0)
    .max(1)
    .default(0.70)
    .describe("Limiar mínimo de similaridade (padrão 0.70)"),

  filter_source: z
    .enum(["coppe_ufrj", "geipot", "ipea", "bndes_proposta", "wbs_evm", "consultoria", "all"])
    .default("all")
    .describe("Filtrar por tipo de fonte; 'all' busca em todo o corpus"),
});

export type SearchCorpusInput = z.infer<typeof searchCorpusSchema>;

// ─── estrutura de resultado ───────────────────────────────────────────────────

export interface EvidenceChunk {
  source:        string;      // título do documento
  abbrev:        string;      // ex: "COPPE/UFRJ, 2007"
  year:          number | null;
  page:          string;      // "p. 47" ou "seção 3.2"
  similarity:    number;      // 0–1
  excerpt:       string;      // trecho relevante
  isAnonymized:  boolean;     // se true, não revelar identidade da fonte
}

export interface SearchCorpusResult {
  query:    string;
  results:  EvidenceChunk[];
  metadata: {
    totalFound:     number;
    filterApplied:  string;
    minSimilarity:  number;
    note:           string | null;
  };
}

// ─── handler ──────────────────────────────────────────────────────────────────

export async function searchCorpusHandler(
  input: SearchCorpusInput
): Promise<SearchCorpusResult> {
  const { query, top_k, min_similarity, filter_source } = searchCorpusSchema.parse(input);

  // 1. Gera embedding da query
  const embedding = await generateQueryEmbedding(query);

  // 2. Busca semântica no pgvector
  const rows = await cosineSearch({
    embedding,
    topK:          top_k,
    minSimilarity: min_similarity,
    filterSource:  filter_source === "all" ? "all" : filter_source,
  });

  // 3. Formata resultados — protege anonimato do relatório 2018
  const results: EvidenceChunk[] = rows.map((r) => {
    const isAnon = r.isAnonymized === 1;
    return {
      source:       isAnon ? "[Anonimizado]" : r.title,
      abbrev:       isAnon ? "CONSULTORIA ESPECIALIZADA, 2018" : (r.abntAbbrev ?? r.sourceType),
      year:         r.publicationYear,
      page:         r.pageNumber ? `p. ${r.pageNumber}` : (r.sectionTitle ?? "n.p."),
      similarity:   r.similarity,
      excerpt:      r.chunkText.trim(),
      isAnonymized: isAnon,
    };
  });

  // 4. Nota de qualidade se resultados forem escassos
  let note: string | null = null;
  if (results.length === 0) {
    note = "Nenhum resultado acima do limiar de similaridade. " +
           "Reformule a query usando vocabulário técnico naval brasileiro " +
           "(homens-hora, TAP, estaleiro, Promef, FAN, curva de aprendizado).";
  } else if (results.length < 3 || results[0].similarity < 0.78) {
    note = "Cobertura parcial. Considere reformular a query ou reduzir min_similarity.";
  }

  return {
    query,
    results,
    metadata: {
      totalFound:    results.length,
      filterApplied: filter_source,
      minSimilarity: min_similarity,
      note,
    },
  };
}

// ─── definição para registro no MCP server ────────────────────────────────────

export const searchCorpusTool = {
  name: "search_corpus",
  description:
    `Busca semântica nos 19 documentos do RAG base do estudo BNDES Naval
    (COPPE/UFRJ Vols. 1–4, GEIPOT 1999, Benchmarking 2007, IPEA 2014,
    Nota Técnica WBS/EVM, Proposta BNDES, relatório de consultoria 2018).
    Retorna chunks ranqueados por similaridade com metadados de fonte e página.
    Use para localizar evidências empíricas, dados históricos ou posições de política.`,
  schema: searchCorpusSchema,
  handler: searchCorpusHandler,
};
