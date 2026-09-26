/**
 * Catálogo autoritativo dos 19 documentos do RAG base e dos estaleiros
 * brasileiros com seus perfis consolidados.
 *
 * Estes dados são a fonte de verdade para o servidor MCP — qualquer
 * atualização de metadados ou perfil de estaleiro começa aqui.
 */

import type { NewDocument }  from "../schema/documents.js";
import type { NewShipyard }  from "../schema/shipyards.js";

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENTOS DO CORPUS (19 itens)
// ─────────────────────────────────────────────────────────────────────────────

export const DOCUMENTS: NewDocument[] = [
  // ── COPPE/UFRJ ─────────────────────────────────────────────────────────────
  {
    id:              "coppe-v1",
    title:           "Estudos para o Desenvolvimento do Setor de Construção Naval Brasileiro — Volume 1",
    sourceType:      "coppe_ufrj",
    docType:         "volume",
    institution:     "COPPE/UFRJ",
    authors:         JSON.stringify(["Pires Jr., Floriano C. M.", "et al."]),
    filePath:        "/docs/volume1-tomo-I_rev.md",
    abntEntry:       "UNIVERSIDADE FEDERAL DO RIO DE JANEIRO. COPPE. Estudos para o desenvolvimento do setor de construção naval brasileiro. v. 1. Rio de Janeiro: COPPE/UFRJ, 2012.",
    abntAbbrev:      "COPPE/UFRJ, 2012a",
    isAnonymized:    0,
  },
  {
    id:              "coppe-v2",
    title:           "Estudos para o Desenvolvimento do Setor de Construção Naval Brasileiro — Volume 2",
    sourceType:      "coppe_ufrj",
    docType:         "volume",
    institution:     "COPPE/UFRJ",
    authors:         JSON.stringify(["Pires Jr., Floriano C. M.", "et al."]),
    filePath:        "/docs/volume1-tomo-II_rev.md",
    abntEntry:       "UNIVERSIDADE FEDERAL DO RIO DE JANEIRO. COPPE. Estudos para o desenvolvimento do setor de construção naval brasileiro. v. 2. Rio de Janeiro: COPPE/UFRJ, 2012.",
    abntAbbrev:      "COPPE/UFRJ, 2012b",
    isAnonymized:    0,
  },
  {
    id:              "coppe-v3",
    title:           "Estudos para o Desenvolvimento do Setor de Construção Naval Brasileiro — Volume 3",
    sourceType:      "coppe_ufrj",
    docType:         "volume",
    institution:     "COPPE/UFRJ",
    authors:         JSON.stringify(["Pires Jr., Floriano C. M.", "et al."]),
    filePath:        "/docs/volume2-tomoi-revfinal.md",
    abntEntry:       "UNIVERSIDADE FEDERAL DO RIO DE JANEIRO. COPPE. Estudos para o desenvolvimento do setor de construção naval brasileiro. v. 3. Rio de Janeiro: COPPE/UFRJ, 2012.",
    abntAbbrev:      "COPPE/UFRJ, 2012c",
    isAnonymized:    0,
  },
  {
    id:              "coppe-v4",
    title:           "Estudos para o Desenvolvimento do Setor de Construção Naval Brasileiro — Volume 4",
    sourceType:      "coppe_ufrj",
    docType:         "volume",
    institution:     "COPPE/UFRJ",
    authors:         JSON.stringify(["Pires Jr., Floriano C. M.", "et al."]),
    filePath:        "/docs/volume4-revfinal.md",
    abntEntry:       "UNIVERSIDADE FEDERAL DO RIO DE JANEIRO. COPPE. Estudos para o desenvolvimento do setor de construção naval brasileiro. v. 4. Rio de Janeiro: COPPE/UFRJ, 2012.",
    abntAbbrev:      "COPPE/UFRJ, 2012d",
    isAnonymized:    0,
  },

  // ── GEIPOT ─────────────────────────────────────────────────────────────────
  {
    id:              "geipot-sobena-1999",
    title:           "Diagnóstico da Indústria de Construção Naval Brasileira",
    sourceType:      "geipot",
    docType:         "report",
    publicationYear: 1999,
    institution:     "GEIPOT / SOBENA",
    authors:         JSON.stringify(["GEIPOT", "SOBENA"]),
    filePath:        "/docs/GEIPOT-MARINHA_MERCANTE-SOBENA.md",
    abntEntry:       "EMPRESA BRASILEIRA DE PLANEJAMENTO DE TRANSPORTES (GEIPOT); SOCIEDADE BRASILEIRA DE ENGENHARIA NAVAL (SOBENA). Diagnóstico da indústria de construção naval brasileira. Brasília: GEIPOT, 1999.",
    abntAbbrev:      "GEIPOT; SOBENA, 1999",
    isAnonymized:    0,
  },
  {
    id:              "geipot-fgv-1999",
    title:           "Análise Econômica do Setor Naval Brasileiro",
    sourceType:      "geipot",
    docType:         "report",
    publicationYear: 1999,
    institution:     "GEIPOT / FGV",
    authors:         JSON.stringify(["GEIPOT", "Fundação Getulio Vargas"]),
    filePath:        "/docs/GEIPPOT-MARINHA_MERCANTE-FGV.md",
    abntEntry:       "EMPRESA BRASILEIRA DE PLANEJAMENTO DE TRANSPORTES (GEIPOT); FUNDAÇÃO GETULIO VARGAS (FGV). Análise econômica do setor naval brasileiro. Brasília: GEIPOT, 1999.",
    abntAbbrev:      "GEIPOT; FGV, 1999",
    isAnonymized:    0,
  },

  // ── Benchmarking ───────────────────────────────────────────────────────────
  {
    id:              "benchmarking-2007",
    title:           "Benchmarking da Indústria Naval Brasileira",
    sourceType:      "coppe_ufrj",
    docType:         "benchmarking",
    publicationYear: 2007,
    institution:     "COPPE/UFRJ",
    authors:         JSON.stringify(["Pires Jr., Floriano C. M.", "et al."]),
    filePath:        "/docs/Benchmarking-COPPE-RelatorioFinal_-_Copia.md",
    abntEntry:       "UNIVERSIDADE FEDERAL DO RIO DE JANEIRO. COPPE. Benchmarking da indústria naval brasileira. Rio de Janeiro: COPPE/UFRJ, 2007.",
    abntAbbrev:      "COPPE/UFRJ, 2007",
    isAnonymized:    0,
  },

  // ── IPEA ───────────────────────────────────────────────────────────────────
  {
    id:              "ipea-2014",
    title:           "Política Industrial para o Setor Naval",
    sourceType:      "ipea",
    docType:         "report",
    publicationYear: 2014,
    institution:     "IPEA",
    authors:         JSON.stringify(["Instituto de Pesquisa Econômica Aplicada"]),
    filePath:        "/docs/COPPE-ZERO_-_Copia.md",
    abntEntry:       "INSTITUTO DE PESQUISA ECONÔMICA APLICADA. Política industrial para o setor naval. Brasília: IPEA, 2014. (Texto para Discussão, n. 1994).",
    abntAbbrev:      "IPEA, 2014",
    isAnonymized:    0,
  },

  // ── Proposta BNDES ─────────────────────────────────────────────────────────
  {
    id:              "bndes-poli-27664",
    title:           "Proposta Técnica: Oportunidades da Descarbonização e da Transição Energética para a Reestruturação da Indústria Naval",
    sourceType:      "bndes_proposta",
    docType:         "proposal",
    publicationYear: 2025,
    institution:     "POLI/UFRJ – COPPE/UFRJ – COPPETEC",
    authors:         JSON.stringify(["Pires Jr., Floriano C. M.", "et al."]),
    filePath:        "/docs/POLI_27664_Proposta_BNDES_PROF_FLORIANO_CARLOS_MARTINS_PIRES_1_assinado_-_Copia.md",
    abntEntry:       "UNIVERSIDADE FEDERAL DO RIO DE JANEIRO. POLI. Proposta técnica: oportunidades da descarbonização e da transição energética para a reestruturação da indústria naval. Rio de Janeiro: POLI/UFRJ, 2025. (Edital FEP BNDES 01/2025, Processo n. 27664).",
    abntAbbrev:      "POLI/UFRJ, 2025",
    isAnonymized:    0,
  },

  // ── Nota Técnica WBS/EVM ───────────────────────────────────────────────────
  {
    id:              "wbs-evm-nota",
    title:           "Nota Técnica sobre Distorções Introduzidas por WBS/Earned Value Management em Contratos de Construção Naval",
    sourceType:      "wbs_evm",
    docType:         "technical_note",
    publicationYear: 2026,
    institution:     "COPPE/UFRJ",
    authors:         JSON.stringify(["Marins de Souza, Cassiano"]),
    filePath:        "/docs/wbs-evm-nota.md",
    abntEntry:       "MARINS DE SOUZA, Cassiano. Nota técnica sobre distorções introduzidas por WBS/Earned Value Management em contratos de construção naval. Rio de Janeiro: COPPE/UFRJ, 2026. (Nota Técnica).",
    abntAbbrev:      "MARINS DE SOUZA, 2026",
    isAnonymized:    0,
  },

  // ── Relatório Anonimizado ─────────────────────────────────────────────────
  {
    id:              "consultoria-2018",
    title:           "Diagnóstico Operacional de Estaleiro de Grande Porte",
    sourceType:      "consultoria",
    docType:         "report",
    publicationYear: 2018,
    institution:     "[anonimizado]",
    authors:         JSON.stringify(["[anonimizado por decisão da coordenação]"]),
    filePath:        "/docs/consultoria-2018.md",
    abntEntry:       "CONSULTORIA ESPECIALIZADA. Diagnóstico operacional de estaleiro de grande porte. [S.l.]: [s.n.], 2018. (Relatório interno, anonimizado).",
    abntAbbrev:      "CONSULTORIA ESPECIALIZADA, 2018",
    isAnonymized:    1,  // ← NUNCA revelar identidade
  },
];


// ─────────────────────────────────────────────────────────────────────────────
// ESTALEIROS BRASILEIROS — perfis consolidados
// ─────────────────────────────────────────────────────────────────────────────

export const SHIPYARDS: NewShipyard[] = [
  {
    sigla:   "EAS",
    name:    "Estaleiro Atlântico Sul",
    location: "Ipojuca (Suape)",
    state:   "PE",
    coordinates: "-8.3922,-34.9561",

    capacitySteelTonPerYear: 160_000,
    dryDockCount:            1,
    dryDockMaxLengthM:       400,
    coveredAreaM2:           250_000,

    workforcePeak:    10_000,
    workforceCurrent: 2_000,

    status: "paralisado",

    // Hierarquia de déficits — posição analítica consolidada do estudo
    competitivenessEquipment:  "adequado",       // infraestrutura física: OK
    competitivenessProcesses:  "intermediario",  // integração: déficit recuperável
    competitivenessManagement: "critico",        // gestão/eng. naval: gargalo estrutural

    // Evidência empírica central do estudo
    manHoursGapRatio:   "6.6",
    benchmarkReference: "Hyundai Heavy Industries (Coreia do Sul)",

    promefUnitsContracted: 29,
    promefUnitsDelivered:  6,
    promefNotes:
      "Construiu seis plataformas P-class para a Petrobras. Paralisação " +
      "após crise de 2014–2016. Gap de 6,6:1 em man-hours documentado " +
      "em relatório de consultoria especializada (2018, anonimizado).",

    decarbonizationReadiness:
      "Infraestrutura física compatível com retrofitting de sistemas de " +
      "propulsão alternativa (metanol, amônia). Déficit crítico em " +
      "engenharia naval especializada para projetos de descarbonização.",

    primarySources: JSON.stringify(["consultoria-2018", "coppe-v2", "benchmarking-2007"]),
  },

  {
    sigla:   "VARD",
    name:    "VARD Promar (ex-Estaleiro Atlântico Sul — unidade Recife)",
    location: "Recife",
    state:   "PE",
    coordinates: "-8.0522,-34.9286",

    dryDockCount:  1,
    workforcePeak: 3_500,
    status:        "ativo",

    competitivenessEquipment:  "adequado",
    competitivenessProcesses:  "intermediario",
    competitivenessManagement: "intermediario",

    promefNotes:
      "Parceria com VARD (grupo Fincantieri) introduziu metodologias " +
      "europeias de gestão da produção — referência de transferência " +
      "tecnológica no contexto brasileiro.",

    primarySources: JSON.stringify(["coppe-v3", "ipea-2014"]),
  },

  {
    sigla:   "EISA",
    name:    "Estaleiro Ilha S.A.",
    location: "Rio de Janeiro",
    state:   "RJ",
    coordinates: "-22.8835,-43.1765",

    dryDockCount: 2,
    status:       "ativo",

    competitivenessEquipment:  "adequado",
    competitivenessProcesses:  "intermediario",
    competitivenessManagement: "intermediario",

    primarySources: JSON.stringify(["coppe-v1", "geipot-sobena-1999"]),
  },

  {
    sigla:   "WilsonSons",
    name:    "Wilson Sons Estaleiros",
    location: "Guarujá",
    state:   "SP",
    coordinates: "-23.9934,-46.2556",

    status: "ativo",

    competitivenessEquipment:  "adequado",
    competitivenessProcesses:  "adequado",
    competitivenessManagement: "intermediario",

    promefNotes:
      "Especializado em embarcações de apoio offshore e reparos. " +
      "Historicamente mais eficiente em processos integrados que os " +
      "estaleiros de casco pesado do Nordeste.",

    primarySources: JSON.stringify(["coppe-v1", "geipot-fgv-1999"]),
  },

  {
    sigla:   "Oceana",
    name:    "Oceana Offshore",
    location: "Niterói",
    state:   "RJ",
    coordinates: "-22.8835,-43.1234",

    status: "ativo",

    competitivenessEquipment:  "adequado",
    competitivenessProcesses:  "intermediario",
    competitivenessManagement: "critico",

    primarySources: JSON.stringify(["coppe-v2"]),
  },
];
