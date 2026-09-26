/**
 * @file Script de ingestão do corpus
 *
 * Pipeline completo:
 *   1. Seed do catálogo de documentos e estaleiros no PostgreSQL
 *   2. Leitura dos arquivos .md em /docs
 *   3. Chunking com sobreposição (sliding window)
 *   4. Geração de embeddings via Voyage AI (voyage-large-2)
 *   5. Inserção em document_chunks com embedding pgvector
 *   6. Criação do índice HNSW para busca eficiente
 *
 * Uso:
 *   npx tsx scripts/ingest.ts              # ingestão completa
 *   npx tsx scripts/ingest.ts --seed-only  # apenas seed do catálogo
 *   npx tsx scripts/ingest.ts --doc coppe-v1  # apenas um documento
 *
 * Pré-requisitos:
 *   - DATABASE_URL configurado no .env
 *   - VOYAGE_API_KEY configurado no .env
 *   - Arquivos .md em $DOCS_PATH (padrão: ./docs)
 *   - pgvector instalado no PostgreSQL (CREATE EXTENSION vector)
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { join }    from "path";
import "dotenv/config";

import { db, pool, createHNSWIndex } from "../../db/src/client.js";
import { documents, documentChunks } from "../../db/src/schema/documents.js";
import { shipyards, shipyardProjects, internationalBenchmarks }
  from "../../db/src/schema/shipyards.js";
import { DOCUMENTS, SHIPYARDS } from "../../db/src/seed/catalog.js";
import { generateEmbeddingsBatch } from "../src/embeddings.js";
import { eq } from "drizzle-orm";

// ─── configurações de chunking ────────────────────────────────────────────────

const CHUNK_SIZE_WORDS   = 300;  // tamanho alvo por chunk em palavras
const CHUNK_OVERLAP_WORDS = 60;  // sobreposição entre chunks consecutivos
const DOCS_PATH = process.env.DOCS_PATH ?? "./docs";

const DOC_FILE_ALIASES: Record<string, string[]> = {
  "coppe-v1": ["volume1-tomo-I_rev.md", "COPPE-ZERO_-_Copia.md"],
  "coppe-v2": ["volume1-tomo-II_rev.md", "volume2-tomoi-revfinal.md"],
  "coppe-v3": ["volume2-tomoii-revfinal-a.md", "volume2-tomoii-coppe2005.md", "volume3_rev.md"],
  "coppe-v4": ["volume4-revfinal.md", "volume3_rev.md"],
  "geipot-sobena-1999": ["GEIPOT-MARINHA_MERCANTE-SOBENA.md"],
  "geipot-fgv-1999": ["GEIPPOT-MARINHA_MERCANTE-FGV.md", "CONSTRUCAO_NAVAL-FGV.md", "ESTUDO_EXTRA-FGV.md"],
  "benchmarking-2007": ["Benchmarking-COPPE-RelatorioFinal_-_Copia.md"],
  "ipea-2014": ["1oRelatorioProjetoZeroIPT_-_Copia.md", "COPPE-ZERO_-_Copia.md"],
  "bndes-poli-27664": ["POLI_27664_Proposta_BNDES_PROF_FLORIANO_CARLOS_MARTINS_PIRES_1_assinado_-_Copia.md"],
};

function resolveDocumentPath(docId: string, fallbackPath?: string | null): string | null {
  const candidates = new Set<string>();

  const direct = join(DOCS_PATH, `${docId}.md`);
  candidates.add(direct);

  if (fallbackPath) {
    candidates.add(join(DOCS_PATH, fallbackPath.replace(/^\.?\/?docs[\\/]/i, "")));
    if (!fallbackPath.startsWith("/")) {
      candidates.add(join(process.cwd(), fallbackPath));
    }
  }

  for (const alias of DOC_FILE_ALIASES[docId] ?? []) {
    candidates.add(join(DOCS_PATH, alias));
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  const normalizedDocId = docId.toLowerCase().replace(/[^a-z0-9]+/g, "");
  for (const file of readdirSync(DOCS_PATH)) {
    if (!file.endsWith(".md")) continue;
    const normalizedFile = file.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (normalizedFile.includes(normalizedDocId) || normalizedDocId.includes(normalizedFile)) {
      return join(DOCS_PATH, file);
    }
  }

  return null;
}

// ─── ETAPA 1: seed do catálogo ────────────────────────────────────────────────

async function seedCatalog(): Promise<void> {
  console.log("\n📚 Seeding catálogo de documentos...");

  for (const doc of DOCUMENTS) {
    await db
      .insert(documents)
      .values(doc)
      .onConflictDoUpdate({
        target: documents.id,
        set: {
          title:           doc.title,
          abntEntry:       doc.abntEntry,
          abntAbbrev:      doc.abntAbbrev,
          isAnonymized:    doc.isAnonymized,
        },
      });
    console.log(`  ✓ ${doc.id}`);
  }

  console.log("\n🚢 Seeding perfis de estaleiros...");

  for (const shipyard of SHIPYARDS) {
    const [existing] = await db
      .select({ id: shipyards.id })
      .from(shipyards)
      .where(eq(shipyards.sigla, shipyard.sigla));

    if (!existing) {
      await db.insert(shipyards).values(shipyard);
      console.log(`  ✓ ${shipyard.sigla} — ${shipyard.name}`);
    } else {
      console.log(`  ~ ${shipyard.sigla} — já existe, pulando`);
    }
  }

  console.log("✓ Catálogo populado.\n");
}

// ─── ETAPA 2: chunking de texto ───────────────────────────────────────────────

interface Chunk {
  text:         string;
  index:        number;
  pageNumber:   number | null;
  sectionTitle: string | null;
  wordCount:    number;
}

function chunkMarkdown(content: string): Chunk[] {
  const chunks: Chunk[] = [];
  let chunkIndex = 0;
  let currentPage: number | null = null;
  let currentSection: string | null = null;

  // Divide em parágrafos preservando metadados de página e seção
  const paragraphs = content.split(/\n{2,}/);
  const wordBuffer: string[] = [];
  let pageBuffer: number | null = null;
  let sectionBuffer: string | null = null;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Detecta marcadores de página inseridos pelo pipeline pdftotext
    const pageMatch = trimmed.match(/^---\s*página\s+(\d+)\s*---$/i);
    if (pageMatch) {
      currentPage = parseInt(pageMatch[1], 10);
      continue;
    }

    // Detecta títulos de seção (Markdown # ou numerados)
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/) ||
                         trimmed.match(/^(\d+(?:\.\d+)*\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ].+)$/);
    if (headingMatch) {
      currentSection = headingMatch[1] ?? headingMatch[0];
    }

    const words = trimmed.split(/\s+/);
    wordBuffer.push(...words);

    // Quando o buffer atingir o tamanho alvo, emite um chunk
    if (wordBuffer.length >= CHUNK_SIZE_WORDS) {
      chunks.push({
        text:         wordBuffer.join(" "),
        index:        chunkIndex++,
        pageNumber:   pageBuffer ?? currentPage,
        sectionTitle: sectionBuffer ?? currentSection,
        wordCount:    wordBuffer.length,
      });

      // Mantém a sobreposição
      const overlap = wordBuffer.splice(-CHUNK_OVERLAP_WORDS);
      wordBuffer.length = 0;
      wordBuffer.push(...overlap);
      pageBuffer    = currentPage;
      sectionBuffer = currentSection;
    }
  }

  // Chunk residual (palavras que sobraram)
  if (wordBuffer.length > 20) {
    chunks.push({
      text:         wordBuffer.join(" "),
      index:        chunkIndex++,
      pageNumber:   currentPage,
      sectionTitle: currentSection,
      wordCount:    wordBuffer.length,
    });
  }

  return chunks;
}

// ─── ETAPA 3: ingestão de um documento ───────────────────────────────────────

async function ingestDocument(docId: string): Promise<void> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, docId))
    .limit(1);

  if (!doc) {
    console.warn(`  ⚠ ${docId}: não encontrado no catálogo — execute seed primeiro`);
    return;
  }

  const filePath = resolveDocumentPath(docId, doc?.filePath ?? null);
  if (!filePath) {
    console.warn(`  ⚠ ${docId}: arquivo não encontrado em ${DOCS_PATH}`);
    return;
  }

  console.log(`\n📄 Ingerindo ${docId}...`);
  const content = readFileSync(filePath, "utf-8");

  // Verifica se já foi ingerido
  const existing = await pool.query(
    "SELECT COUNT(*) as n FROM document_chunks WHERE document_id = $1",
    [docId]
  );
  if (parseInt(existing.rows[0].n, 10) > 0) {
    console.log(`  ~ ${docId}: já possui ${existing.rows[0].n} chunks, pulando`);
    return;
  }

  // Chunking
  const chunks = chunkMarkdown(content);
  console.log(`  → ${chunks.length} chunks (${content.split(/\s+/).length} palavras totais)`);

  if (chunks.length === 0) {
    console.warn(`  ⚠ ${docId}: nenhum chunk gerado — verificar formato do arquivo`);
    return;
  }

  // Geração de embeddings em lote
  console.log(`  → Gerando embeddings via Voyage AI...`);
  const texts     = chunks.map((c) => c.text);
  const embeddings = await generateEmbeddingsBatch(texts, 8, 300);

  // Inserção no banco
  console.log(`  → Inserindo ${chunks.length} chunks no PostgreSQL...`);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const emb   = embeddings[i];

    await pool.query(
      `INSERT INTO document_chunks
         (document_id, chunk_index, chunk_text, page_number, section_title, word_count, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
      [
        docId,
        chunk.index,
        chunk.text,
        chunk.pageNumber,
        chunk.sectionTitle,
        chunk.wordCount,
        `[${emb.join(",")}]`,
      ]
    );
  }

  // Atualiza word_count no registro do documento
  await db
    .update(documents)
    .set({ wordCount: content.split(/\s+/).length })
    .where(eq(documents.id, docId));

  console.log(`  ✓ ${docId}: ${chunks.length} chunks inseridos com embeddings`);
}

// ─── ETAPA 4: ingestão completa ───────────────────────────────────────────────

async function ingestAll(): Promise<void> {
  // Garante que a extensão pgvector está ativa
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  console.log("✓ pgvector ativo");

  await seedCatalog();

  console.log("📦 Iniciando ingestão dos documentos...\n");
  let ingested = 0;
  let skipped  = 0;

  for (const doc of DOCUMENTS) {
    const filePath = resolveDocumentPath(doc.id, doc.filePath ?? null);
    if (!filePath) {
      console.log(`  - ${doc.id}: arquivo ausente em ${DOCS_PATH} (skip)`);
      skipped++;
      continue;
    }

    await ingestDocument(doc.id);
    ingested++;
  }

  console.log(`\n📊 Ingestão concluída: ${ingested} documentos ingeridos, ${skipped} ausentes`);

  // Cria índice HNSW após toda a ingestão
  console.log("\n🔍 Criando índice HNSW para busca vetorial eficiente...");
  await createHNSWIndex();

  console.log("\n✅ Pipeline de ingestão finalizado. Servidor MCP pronto para uso.");
  await pool.end();
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--seed-only")) {
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  await seedCatalog();
  await pool.end();
} else if (args.includes("--doc")) {
  const docIndex = args.indexOf("--doc");
  const docId    = args[docIndex + 1];
  if (!docId) {
    console.error("Uso: npx tsx scripts/ingest.ts --doc <doc_id>");
    process.exit(1);
  }
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  await ingestDocument(docId);
  await pool.end();
} else {
  await ingestAll();
}
