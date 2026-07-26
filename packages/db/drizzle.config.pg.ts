/**
 * Drizzle Kit config for **Postgres** — generates migrations into `drizzle/pg/`.
 * Used by package scripts (`db:generate:pg`, `db:migrate:pg`) and mirrors `src/pg-schema.ts`.
 */

import "./dotenv-kit-bootstrap.js";
import { defineConfig } from "drizzle-kit";

import { getDatabaseUrl } from "./src/database-url.js";

export default defineConfig({
  schema: "./src/pg-schema.ts",
  out: "./drizzle/pg",
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrl()
  }
});
