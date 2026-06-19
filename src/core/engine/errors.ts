export type EngineErrorCode =
  | 'out_of_bounds'
  | 'blocked_by_wall'
  | 'no_object_here'
  | 'no_token_to_put'
  | 'no_item_to_put';

export const EngineErrors = {
  OUT_OF_BOUNDS: 'out_of_bounds' as EngineErrorCode,
  BLOCKED_BY_WALL: 'blocked_by_wall' as EngineErrorCode,
  NO_OBJECT_HERE: 'no_object_here' as EngineErrorCode,
  NO_TOKEN_TO_PUT: 'no_token_to_put' as EngineErrorCode,
  NO_ITEM_TO_PUT: 'no_item_to_put' as EngineErrorCode
} as const;

export function logEngineError(code: EngineErrorCode, meta?: Record<string, unknown>) {
  // eslint-disable-next-line no-console
  console.warn('[EngineError]', code, meta ?? {});
}


