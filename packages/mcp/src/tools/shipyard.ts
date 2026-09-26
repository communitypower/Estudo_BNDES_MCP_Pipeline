/**
 * Tool: get_shipyard_profile
 *
 * Retorna o perfil completo de um estaleiro brasileiro: capacidade física,
 * histórico de projetos, déficits de competitividade (na hierarquia
 * analítica consolidada pelo estudo) e benchmarks internacionais.
 */

import { z }  from "zod";
import { db, sql } from "../../../db/src/client.js";
import {
  shipyards,
  shipyardProjects,
  internationalBenchmarks,
} from "../../../db/src/schema/shipyards.js";
import { eq } from "drizzle-orm";

// ─── schema de entrada ────────────────────────────────────────────────────────

export const getShipyardProfileSchema = z.object({
  sigla: z.string()
    .min(2)
    .max(16)
    .describe("Sigla do estaleiro: EAS, VARD, EISA, WilsonSons, Oceana"),

  include_benchmarks: z.boolean()
    .default(true)
    .describe("Incluir benchmarks internacionais (padrão true)"),

  include_projects: z.boolean()
    .default(true)
    .describe("Incluir histórico de projetos (padrão true)"),
});

export type GetShipyardProfileInput = z.infer<typeof getShipyardProfileSchema>;

// ─── estrutura de resultado ───────────────────────────────────────────────────

interface CompetitivenessProfile {
  equipment:  string;
  processes:  string;
  management: string;
  summary:    string;
  manHoursGapRatio: string | null;
  benchmarkReference: string | null;
}

interface ShipyardProfileResult {
  found:   boolean;
  sigla:   string;
  name:    string;
  location: string | null;
  status:  string | null;
  capacity: {
    steelTonPerYear:   number | null;
    dryDockCount:      number | null;
    dryDockMaxLengthM: number | null;
    coveredAreaM2:     number | null;
  };
  workforce: {
    peak:    number | null;
    current: number | null;
    retentionRate: string | null;  // calculado quando ambos disponíveis
  };
  competitiveness:  CompetitivenessProfile;
  promef: {
    unitsContracted:  number | null;
    unitsDelivered:   number | null;
    completionRate:   string | null;
    notes:            string | null;
  };
  decarbonization: {
    readiness: string | null;
    notes:     string | null;
  };
  projects:   ProjectSummary[];
  benchmarks: BenchmarkEntry[];
  sources:    string[];
  analyticalNote: string;  // sempre inclui o enquadramento analítico do estudo
}

interface ProjectSummary {
  name:        string | null;
  vesselType:  string | null;
  client:      string | null;
  period:      string;
  units:       number | null;
  program:     string | null;
}

interface BenchmarkEntry {
  country:      string;
  shipyardName: string | null;
  metric:       string;
  value:        string | null;
  unit:         string | null;
  year:         number | null;
}

// ─── handler ──────────────────────────────────────────────────────────────────

export async function getShipyardProfileHandler(
  input: GetShipyardProfileInput
): Promise<ShipyardProfileResult> {
  const { sigla, include_benchmarks, include_projects } =
    getShipyardProfileSchema.parse(input);

  // 1. Busca o estaleiro (case-insensitive)
  const [shipyard] = await db
    .select()
    .from(shipyards)
    .where(sql`UPPER(${shipyards.sigla}) = UPPER(${sigla})`)
    .limit(1);

  if (!shipyard) {
    return {
      found:    false,
      sigla,
      name:     "Estaleiro não encontrado no cadastro",
      location: null,
      status:   null,
      capacity: { steelTonPerYear: null, dryDockCount: null, dryDockMaxLengthM: null, coveredAreaM2: null },
      workforce: { peak: null, current: null, retentionRate: null },
      competitiveness: {
        equipment: "desconhecido",
        processes: "desconhecido",
        management: "desconhecido",
        summary: `Estaleiro "${sigla}" não encontrado no cadastro do estudo.`,
        manHoursGapRatio: null,
        benchmarkReference: null,
      },
      promef:          { unitsContracted: null, unitsDelivered: null, completionRate: null, notes: null },
      decarbonization: { readiness: null, notes: null },
      projects:        [],
      benchmarks:      [],
      sources:         [],
      analyticalNote:  `Perfil de "${sigla}" não disponível. Consultar a equipe de pesquisa para inclusão no cadastro.`,
    };
  }

  // 2. Projetos históricos
  let projects: ProjectSummary[] = [];
  if (include_projects) {
    const rows = await db
      .select()
      .from(shipyardProjects)
      .where(eq(shipyardProjects.shipyardId, shipyard.id));

    projects = rows.map((p) => ({
      name:       p.projectName,
      vesselType: p.vesselType,
      client:     p.client,
      period:     p.yearStart && p.yearEnd
        ? `${p.yearStart}–${p.yearEnd}`
        : p.yearStart
          ? `a partir de ${p.yearStart}`
          : "período não registrado",
      units:   p.unitsCount,
      program: p.program,
    }));
  }

  // 3. Benchmarks internacionais
  let benchmarks: BenchmarkEntry[] = [];
  if (include_benchmarks) {
    const rows = await db
      .select()
      .from(internationalBenchmarks)
      .where(sql`vessel_type IN (
        SELECT vessel_type FROM shipyard_projects
        WHERE shipyard_id = ${shipyard.id}
        LIMIT 3
      )`)
      .limit(10);

    benchmarks = rows.map((b) => ({
      country:      b.country,
      shipyardName: b.shipyardName,
      metric:       b.metric,
      value:        b.value?.toString() ?? null,
      unit:         b.unit,
      year:         b.year,
    }));
  }

  // 4. Nota analítica — sempre presente, enquadra o perfil nas teses do estudo
  const analyticalNote = buildAnalyticalNote(shipyard);

  // 5. Taxa de retenção de mão-de-obra (quando disponível)
  const retentionRate =
    shipyard.workforcePeak && shipyard.workforceCurrent
      ? `${Math.round((shipyard.workforceCurrent / shipyard.workforcePeak) * 100)}% do pico`
      : null;

  // 6. Taxa de conclusão Promef
  const completionRate =
    shipyard.promefUnitsContracted && shipyard.promefUnitsDelivered
      ? `${shipyard.promefUnitsDelivered}/${shipyard.promefUnitsContracted} ` +
        `(${Math.round((shipyard.promefUnitsDelivered / shipyard.promefUnitsContracted) * 100)}%)`
      : null;

  return {
    found:    true,
    sigla:    shipyard.sigla,
    name:     shipyard.name,
    location: shipyard.location ? `${shipyard.location}/${shipyard.state}` : null,
    status:   shipyard.status,
    capacity: {
      steelTonPerYear:   shipyard.capacitySteelTonPerYear,
      dryDockCount:      shipyard.dryDockCount,
      dryDockMaxLengthM: shipyard.dryDockMaxLengthM,
      coveredAreaM2:     shipyard.coveredAreaM2,
    },
    workforce: {
      peak:          shipyard.workforcePeak,
      current:       shipyard.workforceCurrent,
      retentionRate,
    },
    competitiveness: {
      equipment:          shipyard.competitivenessEquipment   ?? "não avaliado",
      processes:          shipyard.competitivenessProcesses   ?? "não avaliado",
      management:         shipyard.competitivenessManagement  ?? "não avaliado",
      manHoursGapRatio:   shipyard.manHoursGapRatio?.toString() ?? null,
      benchmarkReference: shipyard.benchmarkReference,
      summary:            buildCompetitivenessSummary(shipyard),
    },
    promef: {
      unitsContracted: shipyard.promefUnitsContracted,
      unitsDelivered:  shipyard.promefUnitsDelivered,
      completionRate,
      notes:           shipyard.promefNotes,
    },
    decarbonization: {
      readiness: shipyard.decarbonizationReadiness,
      notes:     shipyard.decarbonizationNotes,
    },
    projects,
    benchmarks,
    sources: shipyard.primarySources
      ? JSON.parse(shipyard.primarySources)
      : [],
    analyticalNote,
  };
}

// ─── helpers de formatação ────────────────────────────────────────────────────

function buildCompetitivenessSummary(s: typeof shipyards.$inferSelect): string {
  const lvl = {
    adequado:      "sem déficit significativo",
    intermediario: "déficit intermediário — recuperável no médio prazo",
    critico:       "déficit CRÍTICO — gargalo estrutural prioritário",
  };

  const eq  = s.competitivenessEquipment;
  const pr  = s.competitivenessProcesses;
  const mg  = s.competitivenessManagement;

  if (!eq || !pr || !mg) return "Avaliação de competitividade incompleta no cadastro.";

  return (
    `Hierarquia de déficits em ${s.sigla}: ` +
    `Equipamentos: ${lvl[eq]}; ` +
    `Processos integrados: ${lvl[pr]}; ` +
    `Planejamento/Gestão/Engenharia: ${lvl[mg]}.` +
    (s.manHoursGapRatio
      ? ` Gap documentado de ${s.manHoursGapRatio}:1 em man-hours ` +
        `vs. ${s.benchmarkReference ?? "referência internacional"}.`
      : "")
  );
}

function buildAnalyticalNote(s: typeof shipyards.$inferSelect): string {
  const isCritical = s.competitivenessManagement === "critico";
  const hasGap     = !!s.manHoursGapRatio;

  let note = `${s.name} (${s.sigla}) está enquadrado na análise do estudo ` +
    `como representativo dos desafios estruturais da indústria naval brasileira. `;

  if (isCritical && hasGap) {
    note +=
      `O déficit crítico em gestão/planejamento/engenharia naval — ` +
      `evidenciado pelo gap de ${s.manHoursGapRatio}:1 em man-hours — ` +
      `corrobora a tese central do estudo: a curva de aprendizado é uma ` +
      `propriedade do sistema de gestão da produção, não da série construída. ` +
      `A infraestrutura física (equipamentos: adequado) não é o gargalo; ` +
      `a capacidade organizacional e de engenharia é.`;
  } else if (isCritical) {
    note +=
      `O déficit crítico em gestão e engenharia naval é o principal limitador ` +
      `de competitividade — alinhado com a hierarquia analítica do estudo.`;
  }

  if (s.decarbonizationReadiness) {
    note += ` No contexto da descarbonização: ${s.decarbonizationReadiness}`;
  }

  return note;
}

// ─── definição para registro no MCP server ────────────────────────────────────

export const getShipyardProfileTool = {
  name: "get_shipyard_profile",
  description:
    `Retorna o perfil completo de um estaleiro brasileiro: capacidade física
    (diques, área, tonelagem), força de trabalho, déficits de competitividade
    na hierarquia analítica do estudo (gestão > processos > equipamentos),
    histórico Promef, benchmarks internacionais e potencial de descarbonização.
    Sempre inclui nota analítica enquadrando o estaleiro nas teses do estudo.`,
  schema:   getShipyardProfileSchema,
  handler:  getShipyardProfileHandler,
};
