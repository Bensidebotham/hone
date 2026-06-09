import sanitizeHtml from "sanitize-html";
import { decode } from "he";

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "p", "br", "ul", "ol", "li",
  "strong", "b", "em", "i", "u", "a", "blockquote",
];

export interface CleanedDescription {
  html: string;
  text: string;
}

/**
 * Normalize a raw ATS description into sanitized display HTML + plain text.
 * Greenhouse returns entity-encoded HTML, so we decode entities first; this is
 * harmless for providers that already send real HTML (decode only affects entities).
 */
export function cleanDescription(raw: string | null | undefined): CleanedDescription {
  if (!raw) return { html: "", text: "" };
  const decoded = decode(raw);

  const html = sanitizeHtml(decoded, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "target", "rel"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
  }).trim();

  const text = decode(
    sanitizeHtml(decoded, { allowedTags: [], allowedAttributes: {} })
  )
    .replace(/\s+/g, " ")
    .trim();

  return { html, text };
}
