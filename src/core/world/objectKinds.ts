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


