/** Zero-width joiners/spacers/BOM that marketing templates sprinkle through text. */
const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g;

/**
 * Make a raw Gmail text body readable in a preview pane: normalise line endings,
 * turn non-breaking spaces back into real spaces (they defeat wrapping), drop
 * zero-width padding, and collapse the long runs of blank lines templates leave.
 */
export function cleanEmailBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(ZERO_WIDTH, "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
