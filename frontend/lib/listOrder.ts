export function sortActiveRecent<T extends {
  id: number;
  is_active: boolean;
  updated_at?: string | null;
  created_at?: string | null;
}>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    const ta = Date.parse(a.updated_at || a.created_at || '') || 0;
    const tb = Date.parse(b.updated_at || b.created_at || '') || 0;
    if (tb !== ta) return tb - ta;
    return b.id - a.id;
  });
}

export function toggleActiveInList<T extends {
  id: number;
  is_active: boolean;
  updated_at?: string | null;
}>(items: T[], id: number): T[] {
  const now = new Date().toISOString();
  return sortActiveRecent(
    items.map((item) => (
      item.id === id
        ? { ...item, is_active: !item.is_active, updated_at: now }
        : item
    )),
  );
}
