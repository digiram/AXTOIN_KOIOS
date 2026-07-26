/**
 * Nominatim base URL allowlist — `assertNominatimBaseUrlAllowed` in `src/lib/nominatim-base-url.ts`.
 *
 * Asserts CRM geocoding host restrictions via `NOMINATIM_ALLOWED_HOSTS`.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { assertNominatimBaseUrlAllowed } from "../src/lib/nominatim-base-url.js";

describe("assertNominatimBaseUrlAllowed", () => {
  const orig = process.env.NOMINATIM_ALLOWED_HOSTS;

  afterEach(() => {
    if (orig === undefined) delete process.env.NOMINATIM_ALLOWED_HOSTS;
    else process.env.NOMINATIM_ALLOWED_HOSTS = orig;
  });

  it("allows default public host", () => {
    delete process.env.NOMINATIM_ALLOWED_HOSTS;
    assert.doesNotThrow(() => assertNominatimBaseUrlAllowed("https://nominatim.openstreetmap.org"));
  });

  it("rejects private IP host", () => {
    delete process.env.NOMINATIM_ALLOWED_HOSTS;
    process.env.NOMINATIM_ALLOWED_HOSTS = "10.0.0.1";
    assert.throws(() => assertNominatimBaseUrlAllowed("https://10.0.0.1"), /private/);
  });

  it("rejects host not in allowlist", () => {
    process.env.NOMINATIM_ALLOWED_HOSTS = "nominatim.openstreetmap.org";
    assert.throws(() => assertNominatimBaseUrlAllowed("https://evil.example"), /not in NOMINATIM_ALLOWED_HOSTS/);
  });
});
