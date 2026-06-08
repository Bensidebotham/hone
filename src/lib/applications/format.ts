/**
 * Pure formatting helpers for application data.
 * Kept in a separate module so they can be unit-tested without DOM.
 */

/**
 * Returns a snippet of notes truncated to `max` characters.
 * Returns empty string when notes is null/empty.
 */
export function notesSnippet(notes: string | null, max = 100): string {
  if (!notes) return "";
  if (notes.length <= max) return notes;
  return notes.slice(0, max) + "…";
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

/**
 * Returns a human-readable date label for an application.
 * "Applied {date}" when appliedAt is present, "Updated {date}" otherwise.
 */
export function appliedDateLabel(
  appliedAt: Date | null,
  updatedAt: Date
): string {
  if (appliedAt) {
    return `Applied ${appliedAt.toLocaleDateString(undefined, DATE_FORMAT)}`;
  }
  return `Updated ${updatedAt.toLocaleDateString(undefined, DATE_FORMAT)}`;
}
