const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "Oct 16, 22:11:37 UTC" for an ISO timestamp (its own offset kept, nothing converted); null for any other text.
 * Shared by the local pages and the environment status grid (OMN-21166 AC60: no raw ISO timestamp on a page).
 */
export function readableTime(text: string): string | null {
  const parts = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(text);
  const month = parts ? MONTHS[Number(parts[1]) - 1] : undefined;
  if (!parts || month === undefined) return null;
  const zone = parts[4] === 'Z' || parts[4] === '+00:00' ? 'UTC' : parts[4];
  return `${month} ${Number(parts[2])}, ${parts[3]} ${zone}`;
}
