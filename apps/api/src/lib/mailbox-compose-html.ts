/**
 * Server-side sanitization for outbound mailbox HTML (mirrors web inbound DOMPurify policy).
 */

import DOMPurify from "isomorphic-dompurify";

DOMPurify.addHook("uponSanitizeElement", (node, data) => {
  if (data.tagName !== "meta" || !(node instanceof Element)) return;
  const httpEquiv = node.getAttribute("http-equiv");
  if (httpEquiv && httpEquiv.toLowerCase() === "refresh") {
    node.parentNode?.removeChild(node);
  }
});

const COMPOSE_PURIFY_CONFIG = {
  WHOLE_DOCUMENT: false,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel|cid|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: [
    "script",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "frame",
    "frameset",
    "applet",
    "base"
  ],
  FORBID_ATTR: ["srcdoc", "onerror", "onload", "onclick", "onmouseover"],
  ADD_TAGS: ["style"],
  ADD_ATTR: ["target", "rel", "referrerpolicy"]
};

export const sanitizeMailboxComposeHtml = (html: string | null | undefined): string | null => {
  const raw = html?.trim();
  if (!raw) return null;
  return DOMPurify.sanitize(raw, COMPOSE_PURIFY_CONFIG);
};
