/**
 * OMN-24616 AC7: one CSV cell for every export on the local pages (Runs and Delegation Evidence).
 * A served string that starts with =, +, -, @, a tab or a carriage return is prefixed with a single quote and
 * quoted, so a spreadsheet does not run it as a formula (OWASP CSV injection). A number or boolean is written as
 * served, so a negative cost stays a number. Drafted through onex delegate run 68dc32a1.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

function quoted(text: string): string {
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') {
    if (FORMULA_START.test(value)) return quoted(`'${value}`);
    return NEEDS_QUOTES.test(value) ? quoted(value) : value;
  }
  const json = JSON.stringify(value) ?? '';
  return NEEDS_QUOTES.test(json) ? quoted(json) : json;
}
