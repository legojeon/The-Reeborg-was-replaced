import { EngineErrors } from '../core/engine/errors';

export function reasonToMessage(reason?: string): string {
  switch (reason) {
    case EngineErrors.OUT_OF_BOUNDS: return '경계 밖으로 이동할 수 없습니다.';
    case EngineErrors.BLOCKED_BY_WALL: return '벽에 막혀 이동할 수 없습니다.';
    case EngineErrors.NO_OBJECT_HERE: return '여기에는 집을 오브젝트가 없습니다.';
    case EngineErrors.NO_TOKEN_TO_PUT: return '놓을 토큰이 없습니다.';
    case EngineErrors.NO_ITEM_TO_PUT: return '내려놓을 아이템이 없습니다.';
    default: return '실행 중 오류가 발생했습니다.';
  }
}


