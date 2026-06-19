export type ObjectKind = 'token' | 'carrot' | 'apple' | 'banana' | 'leaf' | 'dandelion';

export const OBJECT_KINDS: ReadonlySet<ObjectKind> = new Set<ObjectKind>([
  'token',
  'carrot',
  'apple',
  'banana',
  'leaf',
  'dandelion'
]);

export function isObjectKind(value: string): value is ObjectKind {
  return (OBJECT_KINDS as Set<string>).has(value);
}

// Some Reeborg worlds use object kinds we don't ship a model for. Map them onto
// the closest kind we do have so those worlds stay playable (reusing assets).
const OBJECT_KIND_ALIASES: Record<string, ObjectKind> = {
  star: 'token',
  daisy: 'dandelion',
  tulip: 'dandelion',
  flower: 'dandelion'
};

// Resolve a raw kind string to a supported ObjectKind, or null if unknown.
export function normalizeObjectKind(value: string): ObjectKind | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (isObjectKind(v)) return v;
  return OBJECT_KIND_ALIASES[v] ?? null;
}


