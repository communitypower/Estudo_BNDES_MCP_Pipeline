/**
 * @file Orquestrador do pipeline de análise BNDES Naval
 *
 * Executa o fluxo completo:
 *   Orquestrador → (Busca ∥ Contextualização) → Síntese → Verificador → Citação
 *
 * Cada agente recebe o histórico acumulado — garantindo rastreabilidade
 * completa da cadeia de raciocínio e consistência entre etapas.
 */

import {
  AGENT_SYSTEM_PROMPTS,
  getContextualizedPrompt,
  type AgentName,
} from "./prompts/index.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MCP_SERVER_URL   = "http://localhost:3100/mcp";  // bndes-naval-mcp local
const MODEL            = "claude-sonnet-4-6";
const MAX_TOKENS       = 8192;

// ─── tipos ────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AgentCallOptions {
  agent: AgentName;
  messages: Message[];
  sectionContext?: Parameters<typeof getContextualizedPrompt>[1];
  /** Agentes que precisam das tools MCP */
  useMcp?: boolean;
}

interface SectionAnalysisInput {
  title: string;
  researchQuestion: string;
  axis: 1 | 2 | 3 | 4;
  targetAudience?: "BNDES" | "academia" | "industria";
}

interface SectionAnalysisOutput {
  plan:          string;   // JSON — output do Orquestrador
  evidence:      string;   // JSON — output do Agente de Busca
  context:       string;   // JSON — output do Agente de Contextualização
  draft:         string;   // texto — output do Agente de Síntese (anotado)
  verification:  string;   // texto + JSON — output do Verificador
  finalSection:  string;   // texto — output do Agente de Citação (pronto p/ docx)
  references:    string;   // lista ABNT — output do Agente de Citação
  traceLog:      TraceEntry[];
}

interface TraceEntry {
  agent:       AgentName;
  timestamp:   string;
  inputLength: number;
  outputLength: number;
  tokensUsed?: number;
}

// ─── chamada base à API ───────────────────────────────────────────────────────

async function callAgent(opts: AgentCallOptions): Promise<string> {
  const { agent, messages, sectionContext, useMcp = false } = opts;

  const systemPrompt = sectionContext
    ? getContextualizedPrompt(agent, sectionContext)
    : AGENT_SYSTEM_PROMPTS[agent];

  const body: Record<string, unknown> = {
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    system:     systemPrompt,
    messages,
  };

  if (useMcp) {
    body.mcp_servers = [
      {
        type: "url",
        url:  MCP_SERVER_URL,
        name: "bndes-naval-mcp",
      },
    ];
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error [${agent}]: ${response.status} — ${error}`);
  }

  const data = await response.json();

  // Extrai texto de todos os blocos de conteúdo (text + tool results)
  const text = (data.content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("\n");

  return text;
}

// ─── pipeline principal ───────────────────────────────────────────────────────

/**
 * Gera uma seção completa do relatório BNDES passando pelo pipeline
 * de seis agentes em sequência (com Busca e Contextualização em paralelo).
 */
export async function generateSection(
  input: SectionAnalysisInput
): Promise<SectionAnalysisOutput> {
  const traceLog: TraceEntry[] = [];
  const ctx = {
    title:          input.title,
    axis:           input.axis,
    targetAudience: input.targetAudience ?? "BNDES",
  } as const;

  // ── ETAPA 1: Orquestrador produz o plano ──────────────────────────────────
  console.log("⟳ [1/5] Orquestrador — planejando análise...");
  const orchestratorInput: Message[] = [
    {
      role: "user",
      content:
        `Elaborar plano de análise para a seguinte demanda:\n\n` +
        `Seção: "${input.title}"\n` +
        `Pergunta de pesquisa: "${input.researchQuestion}"\n` +
        `Eixo temático: ${input.axis}\n\n` +
        `Produzir o plano estruturado em JSON conforme especificado.`,
    },
  ];

  const plan = await callAgent({
    agent:          "orchestrator",
    messages:       orchestratorInput,
    sectionContext: ctx,
    useMcp:         false,
  });

  traceLog.push({
    agent:        "orchestrator",
    timestamp:    new Date().toISOString(),
    inputLength:  orchestratorInput[0].content.length,
    outputLength: plan.length,
  });

  // ── ETAPA 2: Busca e Contextualização em paralelo ─────────────────────────
  console.log("⟳ [2/5] Busca ∥ Contextualização — recuperando evidências...");

  const parallelInput: Message[] = [
    ...orchestratorInput,
    { role: "assistant", content: plan },
    {
      role: "user",
      content:
        "Executar as buscas e contextualização indicadas no plano acima. " +
        "Usar as ferramentas MCP disponíveis conforme necessário.",
    },
  ];

  const [evidence, context] = await Promise.all([
    callAgent({
      agent:          "search",
      messages:       parallelInput,
      sectionContext: ctx,
      useMcp:         true,
    }),
    callAgent({
      agent:          "contextualization",
      messages:       parallelInput,
      sectionContext: ctx,
      useMcp:         true,
    }),
  ]);

  traceLog.push(
    {
      agent:        "search",
      timestamp:    new Date().toISOString(),
      inputLength:  parallelInput.reduce((acc, m) => acc + m.content.length, 0),
      outputLength: evidence.length,
    },
    {
      agent:        "contextualization",
      timestamp:    new Date().toISOString(),
      inputLength:  parallelInput.reduce((acc, m) => acc + m.content.length, 0),
      outputLength: context.length,
    }
  );

  // ── ETAPA 3: Síntese produz o rascunho ───────────────────────────────────
  console.log("⟳ [3/5] Síntese — redigindo rascunho acadêmico...");

  const synthesisInput: Message[] = [
    { role: "user",      content: orchestratorInput[0].content },
    { role: "assistant", content: plan },
    {
      role: "user",
      content:
        `**Relatório de Evidências do Agente de Busca:**\n\n${evidence}\n\n` +
        `**Contexto Institucional e Histórico:**\n\n${context}\n\n` +
        `Com base nesses materiais e no plano de análise, redigir a seção ` +
        `"${input.title}" conforme os padrões editoriais do Prof. Floriano. ` +
        `Marcar afirmações que precisam de verificação com [[VER: ...]].`,
    },
  ];

  const draft = await callAgent({
    agent:          "synthesis",
    messages:       synthesisInput,
    sectionContext: ctx,
    useMcp:         false,
  });

  traceLog.push({
    agent:        "synthesis",
    timestamp:    new Date().toISOString(),
    inputLength:  synthesisInput.reduce((acc, m) => acc + m.content.length, 0),
    outputLength: draft.length,
  });

  // ── ETAPA 4: Verificador audita o rascunho ────────────────────────────────
  console.log("⟳ [4/5] Verificador — auditando afirmações...");

  const verifierInput: Message[] = [
    ...synthesisInput,
    { role: "assistant", content: draft },
    {
      role: "user",
      content:
        "Auditar o rascunho acima. Verificar todas as marcações [[VER: ...]] " +
        "e as cinco afirmações quantitativas mais relevantes usando cross_reference. " +
        "Produzir o rascunho anotado e o relatório de verificação conforme especificado.",
    },
  ];

  const verification = await callAgent({
    agent:          "verifier",
    messages:       verifierInput,
    sectionContext: ctx,
    useMcp:         true,
  });

  traceLog.push({
    agent:        "verifier",
    timestamp:    new Date().toISOString(),
    inputLength:  verifierInput.reduce((acc, m) => acc + m.content.length, 0),
    outputLength: verification.length,
  });

  // ── ETAPA 5: Citação formata e entrega o produto final ────────────────────
  console.log("⟳ [5/5] Citação — formatando referências ABNT...");

  const citationInput: Message[] = [
    { role: "user",      content: `Seção: "${input.title}"` },
    { role: "assistant", content: verification },
    {
      role: "user",
      content:
        "Com base no rascunho verificado acima (use a versão aprovada pelo " +
        "Verificador), formatar todas as citações em ABNT e produzir a lista " +
        "de referências completa. Usar generate_citation para cada fonte do corpus.",
    },
  ];

  const citationOutput = await callAgent({
    agent:          "citation",
    messages:       citationInput,
    sectionContext: ctx,
    useMcp:         true,
  });

  traceLog.push({
    agent:        "citation",
    timestamp:    new Date().toISOString(),
    inputLength:  citationInput.reduce((acc, m) => acc + m.content.length, 0),
    outputLength: citationOutput.length,
  });

  // Separa o texto da seção da lista de referências
  const refSeparator = citationOutput.indexOf("REFERÊNCIAS");
  const finalSection = refSeparator > -1
    ? citationOutput.slice(0, refSeparator).trim()
    : citationOutput;
  const references = refSeparator > -1
    ? citationOutput.slice(refSeparator).trim()
    : "";

  console.log("✓ Pipeline concluído.");

  return {
    plan,
    evidence,
    context,
    draft,
    verification,
    finalSection,
    references,
    traceLog,
  };
}

// ─── utilitário: agente único isolado ────────────────────────────────────────

/**
 * Aciona um único agente com uma pergunta direta — útil para testes
 * e para tarefas isoladas (ex: verificar apenas uma afirmação específica).
 */
export async function askAgent(
  agent: AgentName,
  question: string,
  context?: Parameters<typeof getContextualizedPrompt>[1]
): Promise<string> {
  return callAgent({
    agent,
    messages: [{ role: "user", content: question }],
    sectionContext: context,
    useMcp: ["search", "contextualization", "verifier", "citation"].includes(agent),
  });
}
