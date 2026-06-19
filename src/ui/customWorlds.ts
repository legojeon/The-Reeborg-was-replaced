// User-created worlds from the map maker, persisted in localStorage as
// Reeborg-format JSON (the same format as public/worlds/*.json).

const KEY = 'reeborg3d.customWorlds.v1';
// Built-in (아토) missions the user has removed from their catalog/dropdown.
const HIDDEN_KEY = 'reeborg3d.hiddenBuiltins.v1';

export const CUSTOM_ID_PREFIX = 'custom:';

export function getHiddenBuiltins(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function hideBuiltin(id: string): void {
  const cur = getHiddenBuiltins();
  if (!cur.includes(id)) {
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...cur, id])); } catch { /* ignore */ }
  }
}

export interface CustomWorldRecord {
  id: string; // without prefix
  name: string;
  data: any; // Reeborg world JSON
  updatedAt: number;
}

function readAll(): CustomWorldRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(records: CustomWorldRecord[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export function listCustomWorlds(): CustomWorldRecord[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getCustomWorld(id: string): CustomWorldRecord | undefined {
  return readAll().find(r => r.id === id);
}

export function saveCustomWorld(record: Omit<CustomWorldRecord, 'updatedAt'>): boolean {
  const all = readAll();
  const idx = all.findIndex(r => r.id === record.id);
  const next = { ...record, updatedAt: Date.now() };
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  return writeAll(all);
}

export function deleteCustomWorld(id: string): void {
  writeAll(readAll().filter(r => r.id !== id));
}

// Make a readable id from a name; ensure it does not collide with existing ones.
export function uniqueWorldId(name: string): string {
  const base = String(name ?? '').trim().replace(/\s+/g, '-') || 'world';
  const existing = new Set(readAll().map(r => r.id));
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

// Variant-bundle worlds carry a `variants` array; everything else is a single map.
export function worldVariantCount(data: any): number {
  return Array.isArray(data?.variants) && data.variants.length > 0 ? data.variants.length : 1;
}
