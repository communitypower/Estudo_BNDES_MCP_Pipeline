/**
 * Tools: cross_reference e generate_citation
 *
 * cross_reference — cruza uma afirmação com o corpus e retorna evidências
 * que corroboram, contradizem ou qualificam a afirmação. Usado pelo
 * Agente Verificador para validar cada claim do rascunho.
 *
 * generate_citation — gera citação ABNT formatada a partir do doc_id
 * e de localização (página/seção). Usado pelo Agente de Citação.
 */

import { z }                      from "zod";
import { generateQueryEmbedding } from "../embeddings.js";
import { cosineSearch }           from "../../../db/src/client.js";
import { db }                     from "../../../db/src/client.js";
import { documents }              from "../../../db/src/schema/documents.js";
import { eq }                     from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL: cross_reference
// ═══════════════════════════════════════════════════════════════════════════════

export const crossReferenceSchema = z.object({
  claim: z.string()
    .min(10)
    .max(1024)
    .describe("Afirmação a ser verificada contra o corpus (em linguagem natural)"),

  stance: z.enum(["support", "contradict", "both"])
    .default("both")
    .describe(
      "support = buscar evidências que corroboram; " +
      "contradict = buscar evidências que contradizem; " +
      "both = buscar ambas"
    ),

  top_k: z.number().int().min(1).max(10).default(6)
    .describe("Número de evidências a retornar por stance"),
});

export type CrossReferenceInput = z.infer<typeof crossReferenceSchema>;

export interface CrossReferenceResult {
  claim:          string;
  stance:         string;
  supporting:     CrossReferenceEvidence[];
  contradicting:  CrossReferenceEvidence[];
  verdict:        "well_supported" | "partially_supported" | "contradicted" | "inconclusive";
  verdictRationale: string;
}

interface CrossReferenceEvidence {
  source:      string;
  abbrev:      string;
  year:        number | null;
  page:        string;
  similarity:  number;
  excerpt:     string;
  stance:      "supports" | "contradicts" | "qualifies";
}

export async function crossReferenceHandler(
  input: CrossReferenceInput
): Promise<CrossReferenceResult> {
  const { claim, stance, top_k } = crossReferenceSchema.parse(input);

  // Estratégia: gera dois embeddings — um direto e um negado —
  // para capturar tanto suporte quanto contradição.
  const directEmbedding = await generateQueryEmbedding(claim);
  const negatedEmbedding = await generateQueryEmbedding(`NÃO é verdade que: ${claim}`);

  // Busca paralela
  const [supportRows, contradictRows] = await Promise.all([
    stance !== "contradict"
      ? cosineSearch({ embedding: directEmbedding, topK: top_k, minSimilarity: 0.65 })
      : Promise.resolve([]),
    stance !== "support"
      ? cosineSearch({ embedding: negatedEmbedding, topK: top_k, minSimilarity: 0.60 })
      : Promise.resolve([]),
  ]);

  // Formata evidências de suporte
  const supporting: CrossReferenceEvidence[] = supportRows.map((r) => ({
    source:     r.isAnonymized === 1 ? "[Anonimizado]" : r.title,
    abbrev:     r.isAnonymized === 1 ? "CONSULTORIA ESPECIALIZADA, 2018" : (r.abntAbbrev ?? ""),
    year:       r.publicationYear,
    page:       r.pageNumber ? `p. ${r.pageNumber}` : (r.sectionTitle ?? "n.p."),
    similarity: r.similarity,
    excerpt:    r.chunkText.trim(),
    stance:     classifyStance(claim, r.chunkText, "support"),
  }));

  // Formata evidências contraditórias (exclui duplicatas do suporte)
  const supportIds = new Set(supportRows.map((r) => r.chunkId));
  const contradicting: CrossReferenceEvidence[] = contradictRows
    .filter((r) => !supportIds.has(r.chunkId))
    .map((r) => ({
      source:     r.isAnonymized === 1 ? "[Anonimizado]" : r.title,
      abbrev:     r.isAnonymized === 1 ? "CONSULTORIA ESPECIALIZADA, 2018" : (r.abntAbbrev ?? ""),
      year:       r.publicationYear,
      page:       r.pageNumber ? `p. ${r.pageNumber}` : (r.sectionTitle ?? "n.p."),
      similarity: r.similarity,
      excerpt:    r.chunkText.trim(),
      stance:     classifyStance(claim, r.chunkText, "contradict"),
    }));

  // Veredito
  const { verdict, rationale } = buildVerdict(supporting, contradicting);

  return {
    claim,
    stance,
    supporting,
    contradicting,
    verdict,
    verdictRationale: rationale,
  };
}

function classifyStance(
  claim: string,
  excerpt: string,
  defaultStance: "support" | "contradict"
): "supports" | "contradicts" | "qualifies" {
  // Heurística simples: se o excerpt contém negações em relação ao claim,
  // provavelmente qualifica ou contradiz. Casos ambíguos → qualifies.
  const negationPatterns = /\b(não|nunca|jamais|impossível|insuficiente|inadequado)\b/i;
  const hasNegation = negationPatterns.test(excerpt);

  if (defaultStance === "support") {
    return hasNegation ? "qualifies" : "supports";
  } else {
    return hasNegation ? "contradicts" : "qualifies";
  }
}

function buildVerdict(
  supporting: CrossReferenceEvidence[],
  contradicting: CrossReferenceEvidence[]
): { verdict: CrossReferenceResult["verdict"]; rationale: string } {
  const strongSupport   = supporting.filter((e)   => e.similarity > 0.80).length;
  const strongContradict = contradicting.filter((e) => e.similarity > 0.75).length;

  if (strongSupport >= 2 && strongContradict === 0) {
    return {
      verdict: "well_supported",
      rationale: `${strongSupport} evidências com alta similaridade (>0.80) corroboram a afirmação, sem contradições significativas no corpus.`,
    };
  }

  if (strongSupport >= 1 && strongContradict === 0) {
    return {
      verdict: "partially_supported",
      rationale: `${supporting.length} evidência(s) suportam a afirmação, mas a cobertura documental é limitada. Considere reforçar com dado de campo.`,
    };
  }

  if (strongContradict >= 1 && strongSupport === 0) {
    return {
      verdict: "contradicted",
      rationale: `${strongContradict} evidência(s) contradizem a afirmação. Revisar antes de incluir no relatório.`,
    };
  }

  if (supporting.length === 0 && contradicting.length === 0) {
    return {
      verdict: "inconclusive",
      rationale: "Corpus não contém evidências suficientes para corroborar ou contradizer a afirmação. Pode requerer dado primário (entrevista ou fonte externa).",
    };
  }

  return {
    verdict: "partially_supported",
    rationale: `Evidências mistas: ${supporting.length} suportam, ${contradicting.length} qualificam ou contradizem. Reformular para maior precisão.`,
  };
}

export const crossReferenceTool = {
  name: "cross_reference",
  description:
    `Cruza uma afirmação ou claim factual com o corpus dos 19 documentos do estudo
    e retorna evidências que corroboram, qualificam ou contradizem a afirmação.
    Emite veredito: well_supported | partially_supported | contradicted | inconclusive.
    Ideal para o Agente Verificador auditar cada claim do rascunho antes da entrega.`,
  schema:  crossReferenceSchema,
  handler: crossReferenceHandler,
};


// ═══════════════════════════════════════════════════════════════════════════════
// TOOL: generate_citation
// ═══════════════════════════════════════════════════════════════════════════════

export const generateCitationSchema = z.object({
  doc_id: z.string()
    .min(3)
    .max(64)
    .describe("ID do documento no catálogo (ex: coppe-v1, geipot-sobena-1999, wbs-evm-nota)"),

  page_or_section: z.string()
    .optional()
    .describe("Número de página (ex: '47') ou título de seção (ex: '3.2 Competitividade')"),

  citation_type: z.enum(["inline", "footnote", "reference_list"])
    .default("inline")
    .describe(
      "inline = (AUTOR, ano, p. XX) no corpo do texto; " +
      "footnote = nota de rodapé completa; " +
      "reference_list = entrada completa para lista de referências"
    ),
});

export type GenerateCitationInput = z.infer<typeof generateCitationSchema>;

export interface GenerateCitationResult {
  docId:        string;
  found:        boolean;
  isAnonymized: boolean;
  inline:       string;   // (AUTOR, ano, p. XX)
  footnote:     string;   // versão expandida para nota de rodapé
  referenceList: string;  // entrada ABNT completa para lista de referências
  warning:      string | null;
}

export async function generateCitationHandler(
  input: GenerateCitationInput
): Promise<GenerateCitationResult> {
  const { doc_id, page_or_section } = generateCitationSchema.parse(input);

  // Busca o documento no catálogo
  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, doc_id))
    .limit(1);

  // Se não encontrado no DB, tenta resolver pelo catálogo embutido
  if (!doc) {
    return {
      docId:        doc_id,
      found:        false,
      isAnonymized: false,
      inline:       `(DOCUMENTO "${doc_id}" NÃO ENCONTRADO)`,
      footnote:     `Documento "${doc_id}" não localizado no catálogo. Verificar com a coordenação do estudo.`,
      referenceList: "",
      warning:      `doc_id "${doc_id}" não existe no catálogo. IDs válidos: coppe-v1..v4, geipot-sobena-1999, geipot-fgv-1999, benchmarking-2007, ipea-2014, bndes-poli-27664, wbs-evm-nota, consultoria-2018.`,
    };
  }

  const isAnon = doc.isAnonymized === 1;
  const locator = buildLocator(page_or_section);

  // Protege identidade do relatório anonimizado
  if (isAnon) {
    return {
      docId:        doc_id,
      found:        true,
      isAnonymized: true,
      inline:       `(CONSULTORIA ESPECIALIZADA, 2018${locator.inline})`,
      footnote:     `CONSULTORIA ESPECIALIZADA. Diagnóstico operacional de estaleiro de grande porte. [S.l.]: [s.n.], 2018${locator.footnote}.`,
      referenceList: `CONSULTORIA ESPECIALIZADA. Diagnóstico operacional de estaleiro de grande porte. [S.l.]: [s.n.], 2018. (Relatório interno, anonimizado).`,
      warning:      "Relatório anonimizado por decisão da coordenação. A identidade da consultoria e do estaleiro NÃO deve ser revelada em nenhuma publicação.",
    };
  }

  // Extrai abreviatura para citação inline
  const abbrev = doc.abntAbbrev ?? buildAbbrev(doc);

  return {
    docId:        doc_id,
    found:        true,
    isAnonymized: false,
    inline:       `(${abbrev}${locator.inline})`,
    footnote:     `${doc.abntEntry ?? doc.title}${locator.footnote}.`,
    referenceList: doc.abntEntry ?? `${doc.institution}. ${doc.title}. ${doc.publicationYear ?? "s.d."}.`,
    warning:      null,
  };
}

function buildLocator(pageOrSection?: string): { inline: string; footnote: string } {
  if (!pageOrSection) return { inline: "", footnote: "" };

  const isPage = /^\d+$/.test(pageOrSection.trim());
  if (isPage) {
    return {
      inline:   `, p. ${pageOrSection}`,
      footnote: `, p. ${pageOrSection}`,
    };
  }

  return {
    inline:   "",
    footnote: `, ${pageOrSection}`,
  };
}

function buildAbbrev(doc: typeof documents.$inferSelect): string {
  const year = doc.publicationYear ?? "s.d.";
  if (doc.institution) {
    const abbrevInst = doc.institution.length > 20
      ? doc.institution.split(/[/,]/)[0].trim()
      : doc.institution;
    return `${abbrevInst}, ${year}`;
  }
  return `${doc.id}, ${year}`;
}

export const generateCitationTool = {
  name: "generate_citation",
  description:
    `Gera citação ABNT (NBR 6023:2018 + NBR 10520:2023) para qualquer documento
    do corpus a partir do doc_id e localização (página ou seção).
    Retorna três formatos: inline para o corpo do texto, footnote para notas
    de rodapé, e reference_list para a lista final de referências.
    Para o relatório de consultoria de 2018, emite automaticamente a versão
    anonimizada — a identidade da empresa nunca é revelada.`,
  schema:  generateCitationSchema,
  handler: generateCitationHandler,
};
