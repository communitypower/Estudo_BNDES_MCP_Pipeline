/**
 * @file Exemplos de uso do pipeline de agentes BNDES Naval
 *
 * Demonstra três padrões de uso:
 *   1. Pipeline completo para geração de seção
 *   2. Agente único para tarefa isolada
 *   3. Verificação de afirmação específica antes de incluir no texto
 */

import { generateSection, askAgent } from "./orchestrator.js";
import { writeFileSync } from "fs";

// ─── EXEMPLO 1: Pipeline completo ─────────────────────────────────────────────
// Gera a seção sobre o gap de competitividade do EAS — uma das mais densas
// em evidência quantitativa, portanto ideal para exercitar o Verificador.

async function exemplo1_SectionCompleta() {
  const result = await generateSection({
    title: "Déficits de Competitividade da Indústria Naval Brasileira: "
         + "Uma Análise Hierárquica",
    researchQuestion:
      "Quais são os principais déficits de competitividade da indústria "
    + "naval brasileira e como eles se distribuem entre equipamentos, "
    + "processos integrados e gestão/planejamento/engenharia?",
    axis: 2,
    targetAudience: "BNDES",
  });

  // Salva o produto final (texto + referências)
  writeFileSync(
    "output/secao-competitividade.txt",
    result.finalSection + "\n\n" + result.references,
    "utf-8"
  );

  // Salva o trace para auditoria
  writeFileSync(
    "output/secao-competitividade-trace.json",
    JSON.stringify(result.traceLog, null, 2),
    "utf-8"
  );

  // Salva o plano do Orquestrador para referência futura
  writeFileSync(
    "output/secao-competitividade-plano.json",
    result.plan,
    "utf-8"
  );

  console.log("─".repeat(60));
  console.log("SEÇÃO FINAL (primeiros 1000 chars):");
  console.log(result.finalSection.slice(0, 1000));
  console.log("─".repeat(60));
  console.log("TRACE:");
  result.traceLog.forEach(t =>
    console.log(`  [${t.agent}] → ${t.outputLength} chars`)
  );
}

// ─── EXEMPLO 2: Agente de Busca isolado ───────────────────────────────────────
// Útil quando Cassiano ou Floriano querem localizar uma evidência
// específica sem rodar o pipeline completo.

async function exemplo2_BuscaIsolada() {
  const resultado = await askAgent(
    "search",
    `Localizar evidências sobre os índices de homens-hora por tonelada de aço
    processado (TAP) nos estaleiros brasileiros durante o período Promef.
    Comparar com referências internacionais quando disponível no corpus.`,
    { title: "Diagnóstico Promef", axis: 2 }
  );

  console.log("EVIDÊNCIAS LOCALIZADAS:");
  console.log(resultado);
}

// ─── EXEMPLO 3: Verificação de afirmação específica ───────────────────────────
// Antes de incluir uma afirmação nova no relatório, verificar se
// o corpus a suporta — sem rodar todo o pipeline.

async function exemplo3_VerificacaoIsolada() {
  const afirmacao =
    "A exigência de 65% de índice de nacionalização no Promef foi " +
    "estabelecida sem estudos prévios de capacidade instalada dos " +
    "fornecedores nacionais de equipamentos, gerando gargalos no " +
    "fornecimento de motores, redutores e sistemas de automação.";

  const resultado = await askAgent(
    "verifier",
    `Verificar a seguinte afirmação contra o corpus documental:\n\n"${afirmacao}"\n\n` +
    `Classificar como Tipo A, B ou C e sugerir reformulação se necessário.`,
    { title: "Política Industrial Naval", axis: 2 }
  );

  console.log("RESULTADO DA VERIFICAÇÃO:");
  console.log(resultado);
}

// ─── EXECUÇÃO ─────────────────────────────────────────────────────────────────

const [,, cmd = "section"] = process.argv;

switch (cmd) {
  case "section":     exemplo1_SectionCompleta().catch(console.error); break;
  case "busca":       exemplo2_BuscaIsolada().catch(console.error); break;
  case "verificar":   exemplo3_VerificacaoIsolada().catch(console.error); break;
  default:
    console.log("Uso: npx ts-node src/example.ts [section|busca|verificar]");
}
