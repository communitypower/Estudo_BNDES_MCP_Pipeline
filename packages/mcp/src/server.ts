/**
 * @file Servidor MCP — bndes-naval-mcp
 *
 * Expõe quatro tools para consumo pelos agentes de análise do estudo BNDES:
 *   search_corpus       — busca semântica no corpus de 19 documentos
 *   get_shipyard_profile — perfil completo de estaleiro brasileiro
 *   cross_reference     — validação de afirmações contra o corpus
 *   generate_citation   — geração de citações ABNT
 *
 * Suporta dois modos de transporte:
 *   stdio  — para integração com Claude Desktop e Claude Code (padrão local)
 *   http   — SSE over HTTP para deploy no Railway (produção)
 *
 * Uso:
 *   TRANSPORT=stdio  npx tsx src/server.ts   # Claude Desktop / desenvolvimento
 *   TRANSPORT=http   npx tsx src/server.ts   # Railway / produção
 */

import { McpServer }                           from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport }                 from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono }                                from "hono";
import { serve }                               from "@hono/node-server";
import "dotenv/config";

import { searchCorpusTool }        from "./tools/search.js";
import { getShipyardProfileTool }  from "./tools/shipyard.js";
import { crossReferenceTool, generateCitationTool } from "./tools/verify-cite.js";

// ─── criação do servidor MCP ────────────────────────────────────────────────

function createServer() {
  const server = new McpServer({
    name:        "bndes-naval-mcp",
    version:     "1.0.0",
    description: "Servidor MCP para o estudo BNDES de Descarbonização da Indústria Naval (Edital FEP 01/2025 — COPPE/UFRJ/COPPETEC)",
  });

  // ─── registro das tools ─────────────────────────────────────────────────────

  server.tool(
    searchCorpusTool.name,
    searchCorpusTool.description,
    searchCorpusTool.schema.shape,
    async (args) => {
      const result = await searchCorpusTool.handler(args as any);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  server.tool(
    getShipyardProfileTool.name,
    getShipyardProfileTool.description,
    getShipyardProfileTool.schema.shape,
    async (args) => {
      const result = await getShipyardProfileTool.handler(args as any);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  server.tool(
    crossReferenceTool.name,
    crossReferenceTool.description,
    crossReferenceTool.schema.shape,
    async (args) => {
      const result = await crossReferenceTool.handler(args as any);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  server.tool(
    generateCitationTool.name,
    generateCitationTool.description,
    generateCitationTool.schema.shape,
    async (args) => {
      const result = await generateCitationTool.handler(args as any);
      return {
        content: [{
          type: "text",
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );

  // ─── resources: documentos do corpus acessíveis diretamente ──────────────

  server.resource(
    "bndes-doc",
    "bndes://docs/{doc_id}",
    async (uri) => {
      const docId = uri.pathname.replace("/docs/", "");
      const { readFileSync, existsSync } = await import("fs");
      const { join } = await import("path");

      const docsPath = process.env.DOCS_PATH ?? "./docs";
      const candidates = [join(docsPath, `${docId}.md`)];

      const aliases: Record<string, string[]> = {
        "coppe-v1": ["volume1-tomo-I_rev.md"],
        "coppe-v2": ["volume1-tomo-II_rev.md"],
        "coppe-v3": ["volume2-tomoi-revfinal.md"],
        "coppe-v4": ["volume4-revfinal.md"],
        "geipot-sobena-1999": ["GEIPOT-MARINHA_MERCANTE-SOBENA.md"],
        "geipot-fgv-1999": ["GEIPPOT-MARINHA_MERCANTE-FGV.md"],
        "benchmarking-2007": ["Benchmarking-COPPE-RelatorioFinal_-_Copia.md"],
        "ipea-2014": ["COPPE-ZERO_-_Copia.md"],
        "bndes-poli-27664": ["POLI_27664_Proposta_BNDES_PROF_FLORIANO_CARLOS_MARTINS_PIRES_1_assinado_-_Copia.md"],
      };

      for (const alias of aliases[docId] ?? []) {
        candidates.push(join(docsPath, alias));
      }

      const filePath = candidates.find((candidate) => existsSync(candidate));

      if (!filePath) {
        return {
          contents: [{
            uri:      uri.href,
            text:     `Documento \"${docId}\" não encontrado em ${docsPath}`,
            mimeType: "text/plain",
          }],
        };
      }

      const content = readFileSync(filePath, "utf-8");
      return {
        contents: [{
          uri:      uri.href,
          text:     content,
          mimeType: "text/markdown",
        }],
      };
    }
  );

  // ─── prompts reutilizáveis ─────────────────────────────────────────────────

  server.prompt(
    "analise_competitividade_estaleiro",
    "Análise estruturada de competitividade de um estaleiro específico, " +
    "enquadrada nas teses do estudo BNDES.",
    [{ name: "estaleiro", required: true }],
    async ({ estaleiro }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text:
            `Usando get_shipyard_profile e search_corpus, produzir análise completa ` +
            `de competitividade do estaleiro ${estaleiro}. ` +
            `Estruturar em: (1) perfil e capacidade instalada, ` +
            `(2) hierarquia de déficits, (3) evidência empírica do gap de produtividade, ` +
            `(4) posicionamento frente às oportunidades de descarbonização.`,
        },
      }],
    })
  );

  server.prompt(
    "gap_tecnologico_decarbonizacao",
    "Mapeamento do gap tecnológico para adoção de tecnologias de descarbonização.",
    [{ name: "segmento", required: true }, { name: "tecnologia", required: false }],
    async ({ segmento, tecnologia }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text:
            `Usando search_corpus, mapear o gap tecnológico da indústria naval ` +
            `brasileira no segmento "${segmento}" para ` +
            `${tecnologia ? `a tecnologia de ${tecnologia}` : "tecnologias de descarbonização"}. ` +
            `Incluir: regulatório IMO/EU ETS relevante, capacidade instalada atual, ` +
            `gap de competência de engenharia, e janela de oportunidade.`,
        },
      }],
    })
  );

  return server;
}

// ─── transporte e inicialização ───────────────────────────────────────────────

const TRANSPORT = process.env.TRANSPORT ?? "stdio";
const PORT      = parseInt(process.env.PORT ?? "3100", 10);

if (TRANSPORT === "http") {
  // ── HTTP / Streamable HTTP — compatível com Hono + Node.js ───────────────
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({ status: "ok", server: "bndes-naval-mcp", version: "1.0.0" })
  );

  app.all("/mcp", async (c) => {
    const transport = new WebStandardStreamableHTTPServerTransport();
    const server = createServer();
    await server.connect(transport);
    return transport.handleRequest(c.req.raw);
  });

  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`✓ bndes-naval-mcp (HTTP/Streamable) rodando em http://localhost:${PORT}/mcp`);
  });

} else {
  // ── stdio — Claude Desktop / Claude Code / desenvolvimento local ───────────
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("✓ bndes-naval-mcp conectado via stdio");
}
