/**
 * Parse a date string from the backend as UTC.
 * Backend stores timestamps in UTC but without timezone suffix,
 * so JavaScript would otherwise interpret them as local time.
 */
export function parseUTCDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  return new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
}
