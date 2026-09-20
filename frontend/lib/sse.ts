export async function readSse(
  res: Response,
  onData: (row: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (!signal?.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const part of parts) {
        const line = part.split('\n').find((row) => row.startsWith('data:'));
        if (!line) continue;
        try {
          const row = JSON.parse(line.slice(5).trim());
          if (row && typeof row === 'object') onData(row);
        } catch {
          /* ping or junk */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
