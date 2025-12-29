export type TileKind = 'grass' | 'pale_grass' | 'ice' | 'mud' | 'water' | 'gravel' | 'bricks';

export const TILE_KINDS: ReadonlySet<TileKind> = new Set<TileKind>([
  'grass',
  'pale_grass',
  'ice',
  'mud',
  'water',
  'gravel',
  'bricks'
]);

export function isTileKind(value: string): value is TileKind {
  return (TILE_KINDS as Set<string>).has(value);
}

// Default tile kind to use when unspecified
export const DEFAULT_TILE: TileKind = 'bricks';


