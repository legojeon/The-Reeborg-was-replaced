import { EngineErrors } from '../core/engine/errors';
import { tr, type Lang } from './i18n';

export function reasonToMessage(reason?: string, lang: Lang = 'ko'): string {
  switch (reason) {
    case EngineErrors.OUT_OF_BOUNDS: return tr(lang, 'err.out_of_bounds');
    case EngineErrors.BLOCKED_BY_WALL: return tr(lang, 'err.blocked_by_wall');
    case EngineErrors.NO_OBJECT_HERE: return tr(lang, 'err.no_object_here');
    case EngineErrors.NO_TOKEN_TO_PUT: return tr(lang, 'err.no_token_to_put');
    case EngineErrors.NO_ITEM_TO_PUT: return tr(lang, 'err.no_item_to_put');
    default: return tr(lang, 'err.default');
  }
}
