/**
 * parseSalary — best-effort salary extraction from free text.
 *
 * Normalization rule:
 *   - Values expressed as thousands (e.g. 120,000 or 120000) are collapsed to K form.
 *   - Ranges are joined with an en-dash: $120K–$150K
 *   - Single values: $150K
 *   - All values get a leading $ if not already present (only when the pattern
 *     itself includes a $ or a K/k suffix, so plain integers are not misread).
 *
 * False-positive guards:
 *   - A bare number without $ must be followed by 'k' (case-insensitive) to match,
 *     AND the resolved value must be >= $20K (rules out "5 years", "10 days", "401k").
 *   - Numbers with $ must resolve to >= $20K as well.
 *   - "401k" alone (no leading $ and value < 20) is blocked by the threshold.
 */

const SEP = "\\s*(?:–|-|to)\\s*";

// Money token patterns (capture group = raw value string)
//   $120,000  |  $120k  |  120k  (bare k form only, to avoid matching years/small nums)
const MONEY_FULL = "\\$([0-9]{2,3}),?000"; // $120,000 or $120000
const MONEY_K_DOLLAR = "\\$([0-9]+(?:\\.[0-9]+)?)k"; // $120k  $120.5k
// Range: FULL–FULL  |  K–K  |  bare-k range
// For bare-k, the common format is "120-150k" (k only on hi) or "120k-150k".
// Pattern: no leading digit/$ before lo, lo and hi are 2-3 digits, at least hi ends in k.
const MONEY_K_BARE_RANGE =
  "(?<![0-9$])([0-9]{2,3})k?" + SEP + "([0-9]{2,3})k";

const RANGE_PATTERNS = [
  // $120,000 – $150,000
  `${MONEY_FULL}${SEP}${MONEY_FULL}`,
  // $120k – $150k
  `${MONEY_K_DOLLAR}${SEP}${MONEY_K_DOLLAR}`,
  // 120-150k  or 120k-150k  (bare, no $)
  MONEY_K_BARE_RANGE,
];

// Single value: $150,000  |  $150k  |  (bare-k single is too ambiguous — skip)
const SINGLE_PATTERNS = [MONEY_FULL, MONEY_K_DOLLAR];

// Combined regex: try ranges first (they must come first to not partially match)
const COMBINED = new RegExp(
  [...RANGE_PATTERNS, ...SINGLE_PATTERNS].join("|"),
  "i"
);

/** Parse a raw numeric string (possibly with decimal) as a K-rounded number. */
function toK(raw: string): number {
  return Math.round(parseFloat(raw));
}

/** Format a K number as a display string like "$120K". */
function fmtK(k: number): string {
  return `$${k}K`;
}

const MIN_K = 20; // anything below $20K is likely not a salary

export function parseSalary(text: string | null | undefined): string | null {
  if (!text) return null;

  const m = COMBINED.exec(text);
  if (!m) return null;

  // Determine which pattern matched by inspecting which capture groups are set.
  // Group indices (1-indexed):
  //   Range $full–$full:   g1, g2
  //   Range $k–$k:         g3, g4
  //   Range bare-k–bare-k: g5, g6
  //   Single $full:        g7
  //   Single $k:           g8
  const [, g1, g2, g3, g4, g5, g6, g7, g8] = m;

  if (g1 !== undefined && g2 !== undefined) {
    // $120,000 – $150,000
    const lo = toK(g1);
    const hi = toK(g2);
    if (lo < MIN_K) return null;
    return `${fmtK(lo)}–${fmtK(hi)}`;
  }
  if (g3 !== undefined && g4 !== undefined) {
    // $120k – $150k
    const lo = toK(g3);
    const hi = toK(g4);
    if (lo < MIN_K) return null;
    return `${fmtK(lo)}–${fmtK(hi)}`;
  }
  if (g5 !== undefined && g6 !== undefined) {
    // 120k – 150k (bare)
    const lo = toK(g5);
    const hi = toK(g6);
    if (lo < MIN_K) return null;
    return `${fmtK(lo)}–${fmtK(hi)}`;
  }
  if (g7 !== undefined) {
    // $150,000
    const k = toK(g7);
    if (k < MIN_K) return null;
    return fmtK(k);
  }
  if (g8 !== undefined) {
    // $150k
    const k = toK(g8);
    if (k < MIN_K) return null;
    return fmtK(k);
  }

  return null;
}
