/**
 * RootDocumentHead.test.
 *
 * Asserts production meta-only CSP resolution and safe HTML escaping for the document head injector.
 *
 * Under test: `RootDocumentHead` (`resolveWebMetaCspContent`, `buildMetaCspHtmlTag`).
 */
import { describe, expect, it } from "vitest";

import {
  buildMetaCspHtmlTag,
  resolveWebMetaCspContent
} from "./RootDocumentHead.js";

describe("resolveWebMetaCspContent", () => {
  it("returns undefined outside production meta-only mode", () => {
    expect(resolveWebMetaCspContent({ nodeEnv: "development" })).toBeUndefined();
    expect(
      resolveWebMetaCspContent({ nodeEnv: "production", cspInMeta: "off" })
    ).toBeUndefined();
  });

  it("returns a CSP string in production meta-only mode", () => {
    const csp = resolveWebMetaCspContent({
      nodeEnv: "production",
      apiBaseUrl: "https://api.example.com"
    });
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("api.example.com");
  });
});

describe("buildMetaCspHtmlTag", () => {
  it("escapes double quotes in the content attribute", () => {
    expect(buildMetaCspHtmlTag(`default-src 'self'`)).toContain('content="default-src \'self\'"');
  });
});
