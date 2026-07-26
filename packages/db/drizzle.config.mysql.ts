/**
 * Drizzle Kit config for **MySQL** — migrations under `drizzle/mysql/`.
 */

import "./dotenv-kit-bootstrap.js";
import { defineConfig } from "drizzle-kit";

import { getDatabaseUrl } from "./src/database-url.js";

export default defineConfig({
  schema: "./src/mysql-schema.ts",
  out: "./drizzle/mysql",
  dialect: "mysql",
  dbCredentials: {
    url: getDatabaseUrl()
  }
});
