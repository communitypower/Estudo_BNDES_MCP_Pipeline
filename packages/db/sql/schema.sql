-- Schema do bndes-naval-mcp (idempotente: pode ser reaplicado).
--
-- Gerado com `drizzle-kit generate:pg` a partir de packages/db/src/schema/*.ts.
-- Correção manual: o drizzle-kit 0.20 coloca o tipo customizado entre aspas
-- ("vector(1024)"), que o Postgres interpreta como nome literal de tipo e
-- rejeita; aqui ele aparece sem aspas. Ao alterar o schema, regenere e
-- reaplique essa correção.
--
-- Aplicado por: npm run db:setup (packages/db/scripts/setup.ts), que antes
-- executa CREATE EXTENSION IF NOT EXISTS vector.

DO $$ BEGIN
 CREATE TYPE "doc_type" AS ENUM('volume', 'report', 'technical_note', 'proposal', 'benchmarking', 'dissertation');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "source_type" AS ENUM('coppe_ufrj', 'geipot', 'ipea', 'bndes_proposta', 'wbs_evm', 'consultoria', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "competitiveness_level" AS ENUM('adequado', 'intermediario', 'critico');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "shipyard_status" AS ENUM('ativo', 'paralisado', 'inativo', 'reconversao');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "vessel_type" AS ENUM('fpso', 'plataforma', 'navio_tanque', 'navio_carga_geral', 'offshore_support', 'navio_passageiros', 'navio_guerra', 'barcaca', 'rebocador', 'outro');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" varchar(64) NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"page_number" integer,
	"section_title" text,
	"word_count" integer,
	"embedding" vector(1024),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"source_type" "source_type" NOT NULL,
	"doc_type" "doc_type" NOT NULL,
	"publication_year" integer,
	"authors" text,
	"institution" text,
	"file_path" text,
	"page_count" integer,
	"word_count" integer,
	"abnt_entry" text,
	"abnt_abbrev" varchar(64),
	"is_anonymized" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "international_benchmarks" (
	"id" serial PRIMARY KEY NOT NULL,
	"country" varchar(64) NOT NULL,
	"shipyard_name" text,
	"metric" varchar(128) NOT NULL,
	"value" numeric(12, 2),
	"unit" varchar(32),
	"vessel_type" "vessel_type",
	"year" integer,
	"source_doc_id" varchar(64),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipyard_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"shipyard_id" integer NOT NULL,
	"project_name" text,
	"vessel_type" "vessel_type",
	"client" text,
	"year_start" integer,
	"year_end" integer,
	"units_count" integer DEFAULT 1,
	"program" varchar(32),
	"man_hours_total" numeric(12, 0),
	"steel_weight_ton" numeric(10, 1),
	"construction_months" integer,
	"nationalization_index" numeric(5, 2),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shipyards" (
	"id" serial PRIMARY KEY NOT NULL,
	"sigla" varchar(16) NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"state" varchar(2),
	"coordinates" text,
	"capacity_steel_ton_per_year" integer,
	"dry_dock_count" integer,
	"dry_dock_max_length_m" integer,
	"covered_area_m2" integer,
	"prefab_area_m2" integer,
	"workforce_peak" integer,
	"workforce_current" integer,
	"status" "shipyard_status" DEFAULT 'ativo',
	"competitiveness_equipment" "competitiveness_level",
	"competitiveness_processes" "competitiveness_level",
	"competitiveness_management" "competitiveness_level",
	"man_hours_gap_ratio" numeric(4, 1),
	"benchmark_reference" text,
	"promef_units_contracted" integer,
	"promef_units_delivered" integer,
	"promef_notes" text,
	"decarbonization_readiness" text,
	"decarbonization_notes" text,
	"primary_sources" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "shipyards_sigla_unique" UNIQUE("sigla")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "shipyard_projects" ADD CONSTRAINT "shipyard_projects_shipyard_id_shipyards_id_fk" FOREIGN KEY ("shipyard_id") REFERENCES "shipyards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
