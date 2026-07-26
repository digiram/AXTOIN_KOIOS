/**
 * Convert `@starter/shared` Zod schemas to OpenAPI 3 JSON Schema fragments.
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import type { ZodTypeAny } from "zod";

export const openApiSchemaFromZod = (schema: ZodTypeAny, name: string): Record<string, unknown> =>
  zodToJsonSchema(schema, {
    name,
    target: "openApi3",
    $refStrategy: "none"
  }) as Record<string, unknown>;
