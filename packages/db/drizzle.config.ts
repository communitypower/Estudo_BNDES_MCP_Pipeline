import type { Config } from "drizzle-kit";

export default {
  schema: "packages/db/src/schema/*.ts",
  out: "packages/db/drizzle",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:senha@localhost:5432/bndes_naval",
  },
  verbose: true,
  // strict=false: sem prompt interativo de confirmação, para rodar em CI/Railway.
  strict: false,
} satisfies Config;
