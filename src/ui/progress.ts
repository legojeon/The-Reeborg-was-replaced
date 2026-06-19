// Per-world clear records, persisted in localStorage.

const KEY = 'reeborg3d.progress.v1';

export type ProgressMap = Record<string, 'cleared'>;

export function getProgress(): ProgressMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function markCleared(worldId: string): ProgressMap {
  const cur = getProgress();
  if (cur[worldId] !== 'cleared') {
    cur[worldId] = 'cleared';
    try {
      localStorage.setItem(KEY, JSON.stringify(cur));
    } catch {
      // storage full/blocked — progress is best-effort
    }
  }
  return cur;
}
