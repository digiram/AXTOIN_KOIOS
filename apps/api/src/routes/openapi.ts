/**
 * OpenAPI — generated at runtime from `@starter/shared` Zod schemas; optional Swagger UI at `/docs`.
 * Disabled in production unless `OPENAPI_DOCS_ENABLED=true`.
 */

import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import { buildOpenApiDocument } from "../openapi/build-document.js";

let cachedSpec: Record<string, unknown> | undefined;

export const shouldRegisterOpenApiDocs = (): boolean => {
  if (process.env.OPENAPI_DOCS_ENABLED?.trim().toLowerCase() === "true") {
    return true;
  }
  const env = process.env.NODE_ENV?.trim().toLowerCase();
  return env !== "production";
};

export const getOpenApiDocument = (): Record<string, unknown> => {
  if (!cachedSpec) {
    cachedSpec = buildOpenApiDocument();
  }
  return cachedSpec;
};

export const registerOpenApiRoutes = async (app: FastifyInstance): Promise<void> => {
  if (!shouldRegisterOpenApiDocs()) {
    return;
  }

  const document = getOpenApiDocument();

  await app.register(swagger, {
    openapi: document as Record<string, unknown> & { openapi: string; info: { title: string; version: string } }
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true }
  });

  app.get("/openapi.json", async (_request, reply) => {
    return reply.type("application/json").send(getOpenApiDocument());
  });
};
