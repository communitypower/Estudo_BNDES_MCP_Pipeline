/**
 * Schema de estaleiros brasileiros e seus benchmarks internacionais.
 *
 * O perfil de cada estaleiro consolida dados de:
 *   - capacidade física (diques, área de pré-fabricação, tonelagem)
 *   - déficits de competitividade (hierarquia: gestão > processos > equipamentos)
 *   - histórico no Promef (contratos, entregas, gaps de produtividade)
 *   - benchmarks man-hours vs. referências internacionais
 *
 * A tabela shipyard_competitiveness encoda a hierarquia analítica
 * consolidada pelo estudo em três dimensões ordinais.
 */

import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  decimal,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

// ─── enums ────────────────────────────────────────────────────────────────────

export const competitivenessLevelEnum = pgEnum("competitiveness_level", [
  "adequado",       // sem déficit significativo
  "intermediario",  // déficit recuperável no médio prazo
  "critico",        // gargalo estrutural — prioridade de intervenção
]);

export const shipyardStatusEnum = pgEnum("shipyard_status", [
  "ativo",
  "paralisado",
  "inativo",
  "reconversao",   // reconversão para offshore/reparos
]);

export const vesselTypeEnum = pgEnum("vessel_type", [
  "fpso",
  "plataforma",
  "navio_tanque",
  "navio_carga_geral",
  "offshore_support",
  "navio_passageiros",
  "navio_guerra",
  "barcaca",
  "rebocador",
  "outro",
]);

// ─── tabela principal de estaleiros ───────────────────────────────────────────

export const shipyards = pgTable("shipyards", {
  id:     serial("id").primaryKey(),
  sigla:  varchar("sigla", { length: 16 }).unique().notNull(), // "EAS", "VARD" etc.
  name:   text("name").notNull(),

  // Localização
  location:    text("location"),     // cidade
  state:       varchar("state", { length: 2 }),
  coordinates: text("coordinates"),  // "lat,lng" para o mapa do Portal

  // Capacidade física
  capacitySteelTonPerYear: integer("capacity_steel_ton_per_year"),
  dryDockCount:            integer("dry_dock_count"),
  dryDockMaxLengthM:       integer("dry_dock_max_length_m"),
  coveredAreaM2:           integer("covered_area_m2"),
  prefabAreaM2:            integer("prefab_area_m2"),

  // Força de trabalho
  workforcePeak:    integer("workforce_peak"),    // pico no período Promef
  workforceCurrent: integer("workforce_current"), // situação atual

  // Status operacional
  status: shipyardStatusEnum("status").default("ativo"),

  // Competitividade — hierarquia analítica consolidada
  // (equipamentos < processos integrados < gestão/planejamento/engenharia)
  competitivenessEquipment:  competitivenessLevelEnum("competitiveness_equipment"),
  competitivenessProcesses:  competitivenessLevelEnum("competitiveness_processes"),
  competitivenessManagement: competitivenessLevelEnum("competitiveness_management"),

  // Gap de produtividade (man-hours)
  manHoursGapRatio:   decimal("man_hours_gap_ratio", { precision: 4, scale: 1 }),
  benchmarkReference: text("benchmark_reference"), // estaleiro de referência usado no benchmarking

  // Relação com o Promef
  promefUnitsContracted: integer("promef_units_contracted"),
  promefUnitsDelivered:  integer("promef_units_delivered"),
  promefNotes:           text("promef_notes"),

  // Potencial de descarbonização
  decarbonizationReadiness: text("decarbonization_readiness"),
  decarbonizationNotes:     text("decarbonization_notes"),

  // Fontes documentais para este perfil
  primarySources: text("primary_sources"), // JSON array de doc_ids

  notes:     text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── histórico de projetos por estaleiro ──────────────────────────────────────

export const shipyardProjects = pgTable("shipyard_projects", {
  id:         serial("id").primaryKey(),
  shipyardId: integer("shipyard_id")
                .notNull()
                .references(() => shipyards.id, { onDelete: "cascade" }),

  projectName: text("project_name"),
  vesselType:  vesselTypeEnum("vessel_type"),
  client:      text("client"),
  yearStart:   integer("year_start"),
  yearEnd:     integer("year_end"),
  unitsCount:  integer("units_count").default(1),

  // Programa de fomento associado
  program: varchar("program", { length: 32 }), // "Promef", "FAN", "ProNaval", "FMM"

  // Dados de produtividade documentados (quando disponíveis no corpus)
  manHoursTotal:         decimal("man_hours_total", { precision: 12, scale: 0 }),
  steelWeightTon:        decimal("steel_weight_ton", { precision: 10, scale: 1 }),
  constructionMonths:    integer("construction_months"),
  nationalizationIndex:  decimal("nationalization_index", { precision: 5, scale: 2 }),

  notes: text("notes"),
});

// ─── benchmarks internacionais ────────────────────────────────────────────────

export const internationalBenchmarks = pgTable("international_benchmarks", {
  id:           serial("id").primaryKey(),
  country:      varchar("country", { length: 64 }).notNull(),
  shipyardName: text("shipyard_name"),
  metric:       varchar("metric", { length: 128 }).notNull(),
  value:        decimal("value", { precision: 12, scale: 2 }),
  unit:         varchar("unit", { length: 32 }),
  vesselType:   vesselTypeEnum("vessel_type"),
  year:         integer("year"),
  sourceDocId:  varchar("source_doc_id", { length: 64 }),
  notes:        text("notes"),
});

// ─── tipos TypeScript inferidos ───────────────────────────────────────────────

export type Shipyard            = typeof shipyards.$inferSelect;
export type NewShipyard         = typeof shipyards.$inferInsert;
export type ShipyardProject     = typeof shipyardProjects.$inferSelect;
export type InternationalBenchmark = typeof internationalBenchmarks.$inferSelect;
