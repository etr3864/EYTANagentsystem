export function emptyRow(columns: string[]): Record<string, string> {
  return Object.fromEntries(columns.map((col) => [col, '']));
}

export function rowsFromApi(
  rows: Record<string, unknown>[],
  columns: string[],
): Record<string, string>[] {
  return rows.map((row) => {
    const out: Record<string, string> = {};
    for (const col of columns) {
      const value = row[col];
      out[col] = value == null ? '' : String(value);
    }
    return out;
  });
}

export function parseTsv(text: string): string[][] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t'));
}

export function applyPaste(
  rows: Record<string, string>[],
  columns: string[],
  startRow: number,
  startCol: number,
  grid: string[][],
): Record<string, string>[] {
  const next = rows.map((row) => ({ ...row }));
  grid.forEach((line, rowOffset) => {
    const rowIndex = startRow + rowOffset;
    while (next.length <= rowIndex) next.push(emptyRow(columns));
    line.forEach((cell, colOffset) => {
      const colIndex = startCol + colOffset;
      if (colIndex < columns.length) next[rowIndex][columns[colIndex]] = cell;
    });
  });
  return next;
}

export function renameColumn(
  columns: string[],
  rows: Record<string, string>[],
  index: number,
  nextName: string,
): { columns: string[]; rows: Record<string, string>[] } {
  const name = nextName.trim() || `עמודה ${index + 1}`;
  const prev = columns[index];
  if (name === prev) return { columns, rows };
  const updated = columns.map((col, i) => (i === index ? name : col));
  return {
    columns: updated,
    rows: rows.map((row) => {
      const copy = { ...row };
      copy[name] = copy[prev] ?? '';
      delete copy[prev];
      return copy;
    }),
  };
}

export function suggestedTitle(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').trim() || filename;
}