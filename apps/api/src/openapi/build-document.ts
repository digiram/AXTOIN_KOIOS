/**
 * OpenAPI 3 document assembled from `@starter/shared` Zod contracts (single source of truth).
 */

import {
  crmContactCreateSchema,
  crmListQuerySchema,
  crmOrganizationCreateSchema,
  loginSchema,
  registerSchema,
  registerStartSchema,
  registerVerifySchema,
  salesFunnelBdrLeadCreateSchema,
  tenantSelfRegistrationQuerySchema,
  workforceEmployeeCreateSchema
} from "@starter/shared";

import { openApiSchemaFromZod } from "./zod-to-openapi-schema.js";

const jsonBody = (schema: Record<string, unknown>) => ({
  required: true,
  content: { "application/json": { schema } }
});

const bearerSecurity = [{ bearerAuth: [] }];

const errorResponse = {
  description: "Error",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          error: { type: "string" },
          message: { type: "string" }
        }
      }
    }
  }
};

export const buildOpenApiDocument = (): Record<string, unknown> => ({
  openapi: "3.0.3",
  info: {
    title: "KOIOS API",
    version: "1.0.0",
    description:
      "Versioned REST API under `/v1`. Unversioned: `GET /health`, `GET /ready`, `GET /metrics`, `GET /openapi.json`, `POST /webhooks/stripe`. " +
      "Schemas for request bodies are generated from `@starter/shared` Zod definitions."
  },
  servers: [{ url: "/v1" }],
  paths: {
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Sign in",
        requestBody: jsonBody(openApiSchemaFromZod(loginSchema, "LoginInput")),
        responses: {
          "200": { description: "Access token (and optional refresh) or MFA step" },
          "401": errorResponse
        }
      }
    },
    "/auth/register/start": {
      post: {
        tags: ["Auth"],
        summary: "Start self-service registration (email verification)",
        requestBody: jsonBody(openApiSchemaFromZod(registerStartSchema, "RegisterStartInput")),
        responses: {
          "200": { description: "Verification code sent (or dev code returned)" },
          "403": errorResponse,
          "409": errorResponse
        }
      }
    },
    "/auth/register/verify": {
      post: {
        tags: ["Auth"],
        summary: "Complete registration after email verification",
        requestBody: jsonBody(openApiSchemaFromZod(registerVerifySchema, "RegisterVerifyInput")),
        responses: {
          "200": { description: "Tokens issued or MFA step" },
          "401": errorResponse
        }
      }
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Rotate refresh token",
        responses: {
          "200": { description: "New access token" },
          "401": errorResponse
        }
      }
    },
    "/auth/self-registration": {
      get: {
        tags: ["Auth"],
        summary: "Platform self-registration flag",
        parameters: [
          {
            name: "email",
            in: "query",
            required: false,
            schema: openApiSchemaFromZod(tenantSelfRegistrationQuerySchema, "TenantSelfRegistrationQuery")
          }
        ],
        responses: {
          "200": {
            description: "Whether signup is enabled at platform level",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { selfRegisterEnabled: { type: "boolean" } }
                }
              }
            }
          }
        }
      }
    },
    "/tenant/crm/organizations": {
      get: {
        tags: ["CRM"],
        summary: "List organizations",
        security: bearerSecurity,
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { name: "q", in: "query", schema: { type: "string" } }
        ],
        responses: { "200": { description: "Paged organizations" }, "401": errorResponse }
      },
      post: {
        tags: ["CRM"],
        summary: "Create organization",
        security: bearerSecurity,
        requestBody: jsonBody(openApiSchemaFromZod(crmOrganizationCreateSchema, "CrmOrganizationCreate")),
        responses: { "200": { description: "Created organization" }, "401": errorResponse, "403": errorResponse }
      }
    },
    "/tenant/crm/contacts": {
      get: {
        tags: ["CRM"],
        summary: "List contacts",
        security: bearerSecurity,
        parameters: [
          {
            name: "page",
            in: "query",
            schema: (openApiSchemaFromZod(crmListQuerySchema, "CrmListQuery") as { properties?: { page?: unknown } })
              .properties?.page ?? { type: "integer" }
          }
        ],
        responses: { "200": { description: "Paged contacts" } }
      },
      post: {
        tags: ["CRM"],
        summary: "Create contact",
        security: bearerSecurity,
        requestBody: jsonBody(openApiSchemaFromZod(crmContactCreateSchema, "CrmContactCreate")),
        responses: { "200": { description: "Created contact" } }
      }
    },
    "/tenant/sales/bdr/leads": {
      post: {
        tags: ["Sales"],
        summary: "Create BDR lead",
        security: bearerSecurity,
        requestBody: jsonBody(openApiSchemaFromZod(salesFunnelBdrLeadCreateSchema, "SalesFunnelBdrLeadCreate")),
        responses: { "201": { description: "Created lead" } }
      }
    },
    "/tenant/workforce/employees": {
      post: {
        tags: ["Workforce"],
        summary: "Create employee",
        security: bearerSecurity,
        requestBody: jsonBody(openApiSchemaFromZod(workforceEmployeeCreateSchema, "WorkforceEmployeeCreate")),
        responses: { "200": { description: "Created employee" } }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    }
  }
});
