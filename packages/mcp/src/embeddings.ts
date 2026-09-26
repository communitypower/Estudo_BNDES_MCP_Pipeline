/**
 * Motor de embeddings — Voyage AI (voyage-large-2, 1024 dims).
 *
 * voyage-large-2 é o modelo recomendado pela Anthropic para uso
 * com Claude em tarefas de busca semântica multilíngue.
 * Suporta português sem degradação de qualidade.
 *
 * Fallback: se VOYAGE_API_KEY não estiver disponível, usa um
 * embedding aleatório normalizado (apenas para desenvolvimento local).
 *
 * Variáveis de ambiente requeridas:
 *   VOYAGE_API_KEY   — chave da API Voyage AI (https://www.voyageai.com)
 */

const VOYAGE_API_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL   = "voyage-large-2";
const EMBEDDING_DIMS = 1024;

// ─── geração de embedding único ───────────────────────────────────────────────

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!process.env.VOYAGE_API_KEY) {
    console.warn("⚠ VOYAGE_API_KEY ausente — usando embedding aleatório (dev only)");
    return randomNormalizedVector(EMBEDDING_DIMS);
  }

  // Trunca o texto para o limite do modelo (4096 tokens ~ 16k chars)
  const truncated = text.slice(0, 16_000);

  try {
    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        model:   VOYAGE_MODEL,
        input:   [truncated],
        // "document" para chunks de corpus; "query" para perguntas de busca
        input_type: "document",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 401 || response.status === 403) {
        console.warn(`⚠ Voyage API rejeitou a chave (${response.status}) — usando embedding aleatório (dev only): ${err}`);
        return randomNormalizedVector(EMBEDDING_DIMS);
      }
      throw new Error(`Voyage API error: ${response.status} — ${err}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data[0].embedding;
  } catch (error) {
    if (error instanceof Error && (error.message.includes("401") || error.message.includes("403"))) {
      console.warn("⚠ Voyage API rejeitou a chave — usando embedding aleatório (dev only)");
      return randomNormalizedVector(EMBEDDING_DIMS);
    }
    throw error;
  }
}

// ─── geração de embedding de query (sem input_type="document") ────────────────

export async function generateQueryEmbedding(query: string): Promise<number[]> {
  if (!process.env.VOYAGE_API_KEY) {
    return randomNormalizedVector(EMBEDDING_DIMS);
  }

  try {
    const response = await fetch(VOYAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        model:      VOYAGE_MODEL,
        input:      [query],
        input_type: "query",  // otimizado para queries de busca, não documentos
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      if (response.status === 401 || response.status === 403) {
        console.warn(`⚠ Voyage API rejeitou a chave (${response.status}) — usando embedding aleatório (dev only): ${err}`);
        return randomNormalizedVector(EMBEDDING_DIMS);
      }
      throw new Error(`Voyage API error: ${response.status} — ${err}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
    };

    return data.data[0].embedding;
  } catch (error) {
    if (error instanceof Error && (error.message.includes("401") || error.message.includes("403"))) {
      console.warn("⚠ Voyage API rejeitou a chave — usando embedding aleatório (dev only)");
      return randomNormalizedVector(EMBEDDING_DIMS);
    }
    throw error;
  }
}

// ─── geração em lote (com rate limiting) ─────────────────────────────────────

export async function generateEmbeddingsBatch(
  texts: string[],
  batchSize = 8,
  delayMs   = 200
): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(`  embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)} (${batch.length} chunks)`);

    if (!process.env.VOYAGE_API_KEY) {
      results.push(...batch.map(() => randomNormalizedVector(EMBEDDING_DIMS)));
      continue;
    }

    try {
      const response = await fetch(VOYAGE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${process.env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          model:      VOYAGE_MODEL,
          input:      batch.map((t) => t.slice(0, 16_000)),
          input_type: "document",
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        if (response.status === 401 || response.status === 403) {
          console.warn(`⚠ Voyage batch rejeitou a chave (${response.status}) — usando embeddings aleatórios (dev only): ${err}`);
          results.push(...batch.map(() => randomNormalizedVector(EMBEDDING_DIMS)));
          continue;
        }
        throw new Error(`Voyage batch error: ${response.status} — ${err}`);
      }

      const data = await response.json() as {
        data: Array<{ embedding: number[]; index: number }>;
      };

      // Ordena pelo índice original (a API pode retornar fora de ordem)
      const sorted = data.data.sort((a, b) => a.index - b.index);
      results.push(...sorted.map((d) => d.embedding));

      // Rate limiting gentil
      if (i + batchSize < texts.length) {
        await sleep(delayMs);
      }
    } catch (error) {
      if (error instanceof Error && (error.message.includes("401") || error.message.includes("403"))) {
        console.warn("⚠ Voyage API rejeitou a chave — usando embeddings aleatórios (dev only)");
        results.push(...batch.map(() => randomNormalizedVector(EMBEDDING_DIMS)));
        continue;
      }
      throw error;
    }
  }

  return results;
}

// ─── utilitários ─────────────────────────────────────────────────────────────

function randomNormalizedVector(dims: number): number[] {
  const v = Array.from({ length: dims }, () => Math.random() * 2 - 1);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
