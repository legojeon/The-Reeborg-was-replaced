import React from 'react';
import { Globe, Check } from 'lucide-react';

export type Lang = 'ko' | 'en';

const KEY = 'reeborg3d.lang';

// Flat dictionary. Use {name} placeholders for interpolation.
const STRINGS: Record<Lang, Record<string, string>> = {
  ko: {
    // language
    'lang.ko': '한국어',
    'lang.en': 'English',
    // execution / status
    'status.ready': '코드를 작성하고 실행 버튼을 눌러 보세요.',
    'status.running': '실행 중…',
    'status.stopped': '멈췄어요. 이어서 다음을 누르거나 처음부터 다시 시작할 수 있어요.',
    'preflight.parens': '{line}번째 줄: {name} 뒤에는 괄호가 필요해요 → {name}()',
    // controls
    'ctrl.run': '실행',
    'ctrl.stop': '멈춤',
    'ctrl.prev': '이전',
    'ctrl.next': '다음',
    'ctrl.reset': '처음',
    'ctrl.solution': '답 보기',
    'ctrl.world': '월드 선택',
    'ctrl.defaultWorld': '기본 월드 (자유 연습)',
    'ctrl.groupMissions': '미션',
    'ctrl.groupCustom': '내가 만든 월드',
    // mission panel
    'mission.tag': '미션',
    'mission.free': '자유 연습',
    'mission.missionEmpty': '목표를 달성해 보세요!',
    'mission.freeEmpty': '정해진 목표가 없어요. 코드를 자유롭게 실험해 보세요.',
    'mission.collapse': '미션 접기',
    'mission.expand': '미션 펼치기',
    // result panel
    'result.title': '결과',
    'result.placeholder': '실행 결과가 여기에 표시돼요.',
    // viewport
    'view.reset': '시점 초기화',
    'view.first': '로봇 시점',
    // command help
    'help.aria': '명령어 도움말',
    'help.title': '명령어 도움말',
    'help.note': 'if · while · for · def 같은 파이썬 문법도 쓸 수 있어요.',
    'help.repeat': '아래 코드를 n번 반복',
    'help.move': '앞으로 한 칸 이동',
    'help.turn_left': '왼쪽으로 90도 회전',
    'help.take': '현재 칸의 물건 줍기',
    'help.put': '가진 물건 내려놓기',
    'help.build_wall': '바라보는 방향에 벽 세우기',
    'help.done': '여기서 실행 끝내기',
    'help.think': '동작 사이 간격 설정 (클수록 천천히)',
    'help.wall_in_front': '앞에 벽이 있으면 True',
    'help.wall_on_right': '오른쪽에 벽이 있으면 True',
    'help.front_is_clear': '앞이 비어 있으면 True',
    'help.object_here': '현재 칸에 물건이 있으면 True',
    'help.at_goal': '목표에 도달했으면 True',
    'help.print': '결과 창에 글자 표시',
    // world manager
    'worlds.title': '월드 관리',
    'worlds.manage': '월드 관리',
    'worlds.back': '학습으로',
    'worlds.new': '새로 만들기',
    'worlds.import': '파일 가져오기',
    'worlds.empty': '아직 만든 월드가 없어요. 새로 만들거나 파일을 가져오세요.',
    'worlds.preview': '미리보기',
    'worlds.mission': '미션',
    'worlds.free': '자유',
    'info.type': '유형',
    'info.desc': '설명',
    'worlds.play': '플레이',
    'worlds.edit': '편집',
    'worlds.export': '내보내기',
    'worlds.delete': '삭제',
    'worlds.deleteConfirm': "'{name}' 월드를 삭제할까요?",
    'worlds.importOk': '{n}개 월드를 가져왔어요.',
    'worlds.importSome': '{ok}개 가져옴, {fail}개 실패(올바른 월드 파일이 아니에요).',
    'worlds.variants': '변형 {n}개',
    'worlds.updated': '수정: {date}',
    'info.size': '크기(행×열)',
    'info.robot': '로봇 시작',
    'info.objects': '물건',
    'info.walls': '벽 개수',
    'info.goal': '목표',
    'info.variants': '변형 수',
    'info.goalObjects': '물건 {n}곳',
    'info.goalPos': '도착 ({x},{y})',
    'info.goalFinish': '도착 후보 {n}곳',
    'info.goalWalls': '벽 세우기',
    // editor
    'editor.title': 'Python 코드',
    'editor.download': '코드 다운로드',
    // app
    'app.freePlayFile': 'reeborg_코드',
    // popups
    'popup.successTitle': '성공!',
    'popup.successMsg': '목표를 달성했어요!',
    'popup.failTitle': '다시 도전해 보세요!',
    'popup.errorTitle': '앗, 문제가 생겼어요',
    'popup.failMsg': '아직 목표를 달성하지 못했어요. 코드를 고쳐서 다시 시도해 보세요!',
    'popup.doneTitle': '완료',
    'popup.doneMsg': '실행을 마쳤습니다.',
    'popup.ok': '확인',
    'app.solutionConfirm': '정답 코드를 에디터에 불러올까요? 지금 작성한 코드는 지워져요.',
    // engine errors
    'err.out_of_bounds': '여기서 더 가면 세상 밖이에요. 앞에 길이 있는지 확인해 보세요.',
    'err.blocked_by_wall': '벽에 막혔어요! 다른 길로 가 볼까요?',
    'err.no_object_here': '여기에는 주울 물건이 없어요.',
    'err.no_token_to_put': '놓을 토큰이 없어요.',
    'err.no_item_to_put': '내려놓을 물건이 없어요. 먼저 take()로 주워 보세요.',
    'err.default': '실행 중에 문제가 생겼어요.',
    // python errors (friendly)
    'py.atLine': '{line}번째 줄: ',
    'py.syntax': '{at}문법이 잘못되었어요. 괄호, 따옴표, 콜론(:)을 확인해 보세요.',
    'py.indent': '{at}들여쓰기가 잘못되었어요. 띄어쓰기 4칸을 확인해 보세요.',
    'py.nameNamed': "{at}'{name}'은(는) 없는 이름이에요. 철자가 맞는지 확인해 보세요.",
    'py.name': '{at}없는 이름을 사용했어요. 철자를 확인해 보세요.',
    'py.type': '{at}함수를 잘못 사용했어요. 괄호 안에 넣은 값을 확인해 보세요.',
    'py.value': '{at}함수에 넣은 값이 올바르지 않아요.',
    'py.zerodiv': '{at}0으로는 나눌 수 없어요.',
    'py.index': '{at}없는 위치(번호)를 사용했어요.',
    'py.attr': '{at}그런 기능은 없어요. 점(.) 뒤의 이름을 확인해 보세요.',
    'py.recursion': '{at}함수가 자기 자신을 너무 많이 불렀어요.',
    'py.generic': '{at}실행 중 문제가 생겼어요.',
    'py.tooMany': '동작이 너무 많아요 ({max}개 초과). 끝나지 않는 반복(while True)이 있는지 확인해 주세요.',
    // map maker
    'mk.title': '맵 메이커',
    'mk.name': '월드 이름',
    'mk.new': '새 월드',
    'mk.clear': '비우기',
    'mk.save': '저장',
    'mk.json': 'JSON',
    'mk.delete': '삭제',
    'mk.back': '학습으로',
    'mk.newConfirm': '새 월드를 시작할까요? 저장하지 않은 내용은 사라져요.',
    'mk.clearConfirm': '지금 변형의 내용을 모두 비울까요?',
    'mk.secDraw': '그리기 도구',
    'mk.secTiles': '바닥 타일',
    'mk.secPlace': '물건 두기 (시작 배치)',
    'mk.secGoal': '목표 만들기',
    'mk.secSettings': '월드 설정',
    'mk.wall': '벽', 'mk.wallHint': '모서리',
    'mk.robot': '로봇', 'mk.robotHint': '위치',
    'mk.dir': '방향', 'mk.dirHint': '돌리기',
    'mk.erase': '지우개', 'mk.eraseHint': '칸 비우기',
    'mk.arrive': '도착 칸',
    'mk.goalWall': '목표 벽',
    'mk.empty': '빈 칸',
    'mk.rows': '행(세로)',
    'mk.cols': '열(가로)',
    'mk.tokens': '로봇 토큰',
    'mk.variants': '변형',
    'mk.variant': '변형 {n}',
    'mk.addVariant': '+ 변형 추가',
    'mk.variantHint': '플레이할 때 변형 중 하나가 무작위로 나와요',
    'mk.deleteVariant': '이 변형 삭제',
    'mk.duplicateVariant': '이 변형 복제',
    'mk.descLabel': '미션 설명 (Markdown)',
    'mk.descPreview': '미리보기',
    'mk.descPlaceholder': '# 제목\n설명을 적어요. **굵게**, *기울임*도 돼요.\n- 목록도 가능\n\n(빈 줄로 문단을 나눠요)',
    'mk.solLabel': '정답 코드 (선택)',
    'mk.validate': '정답 검증',
    'mk.solEmpty': '검증할 정답 코드를 먼저 입력해 주세요.',
    'mk.checking': '정답 코드를 실행해 확인하는 중…',
    'mk.checkPass': '정답 코드가 목표를 달성했어요!',
    'mk.checkFail': '정답 코드가 목표를 달성하지 못했어요.',
    'mk.checkVariantOk': '목표 달성',
    'mk.checkVariantFail': '목표 미달성',
    'mk.checkNoGoal': '이 변형에는 목표가 없어요.',
    'mk.checkLine': '{line}번째 줄',
    'mk.zoomIn': '확대',
    'mk.zoomOut': '축소',
    'mk.zoomReset': '100%로 되돌리기',
    'mk.nameRequired': '월드 이름을 입력해 주세요.',
    'mk.saveFail': '저장에 실패했어요 (저장 공간 부족).',
    'mk.saved': '저장했어요!',
    'mk.deleteConfirm': '이 월드를 삭제할까요?',
    // context bar
    'ctx.place': '{kind} 두기',
    'ctx.count': '개수',
    'ctx.random': '랜덤 개수',
    'ctx.goal': '{kind} 목표',
    'ctx.all': '모두 모으기 (all)',
    'ctx.hint.wall': '칸의 모서리를 클릭해 벽을 세우세요.',
    'ctx.hint.goalWall': '목표 벽: 모서리를 클릭하세요 (초록 점선으로 표시돼요).',
    'ctx.hint.goalEmpty': '빈 칸 목표: 끝에 비어 있어야 할 칸을 클릭하세요.',
    'ctx.hint.goalPos': '로봇이 도착해야 할 칸을 클릭하세요.',
    'ctx.hint.robot': '로봇 시작 위치로 둘 칸을 클릭하세요.',
    'ctx.hint.erase': '지울 칸을 클릭하면 그 칸의 물건·타일·목표가 비워져요.',
    'ctx.hint.tile': '칠할 칸을 클릭하세요.',
    'ctx.hint.none': '도구를 선택하세요.',
    // object kinds
    'kind.token': '토큰', 'kind.carrot': '당근', 'kind.apple': '사과',
    'kind.banana': '바나나', 'kind.leaf': '나뭇잎', 'kind.dandelion': '민들레',
    // tile kinds
    'tile.grass': '잔디', 'tile.pale_grass': '연잔디', 'tile.ice': '얼음',
    'tile.mud': '진흙', 'tile.water': '물', 'tile.gravel': '자갈', 'tile.bricks': '벽돌'
  },
  en: {
    'lang.ko': '한국어',
    'lang.en': 'English',
    'status.ready': 'Write some code and press Run.',
    'status.running': 'Running…',
    'status.stopped': 'Stopped. Press Next to continue, or Reset to start over.',
    'preflight.parens': 'Line {line}: {name} needs parentheses → {name}()',
    'ctrl.run': 'Run',
    'ctrl.stop': 'Stop',
    'ctrl.prev': 'Prev',
    'ctrl.next': 'Next',
    'ctrl.reset': 'Reset',
    'ctrl.solution': 'Solution',
    'ctrl.world': 'World',
    'ctrl.defaultWorld': 'Default (free play)',
    'ctrl.groupMissions': 'Missions',
    'ctrl.groupCustom': 'My worlds',
    'mission.tag': 'Mission',
    'mission.free': 'Free play',
    'mission.missionEmpty': 'Reach the goal!',
    'mission.freeEmpty': 'No fixed goal — experiment freely with code.',
    'mission.collapse': 'Collapse mission',
    'mission.expand': 'Expand mission',
    'result.title': 'Result',
    'result.placeholder': 'Run results will appear here.',
    'view.reset': 'Reset view',
    'view.first': 'Robot view',
    // command help
    'help.aria': 'Command help',
    'help.title': 'Commands',
    'help.note': 'You can also use Python like if · while · for · def.',
    'help.repeat': 'Repeat the indented code n times',
    'help.move': 'Move forward one cell',
    'help.turn_left': 'Turn 90° to the left',
    'help.take': 'Pick up an object in this cell',
    'help.put': 'Put down a carried object',
    'help.build_wall': 'Build a wall on the facing side',
    'help.done': 'End the run here',
    'help.think': 'Delay between actions (bigger = slower)',
    'help.wall_in_front': 'True if a wall is in front',
    'help.wall_on_right': 'True if a wall is on the right',
    'help.front_is_clear': 'True if the way ahead is open',
    'help.object_here': 'True if an object is in this cell',
    'help.at_goal': 'True if the goal is reached',
    'help.print': 'Show text in the Result panel',
    // world manager
    'worlds.title': 'World manager',
    'worlds.manage': 'Manage',
    'worlds.back': 'To Learn',
    'worlds.new': 'New world',
    'worlds.import': 'Import file',
    'worlds.empty': 'No worlds yet. Create one or import a file.',
    'worlds.preview': 'Preview',
    'worlds.mission': 'Mission',
    'worlds.free': 'Free',
    'info.type': 'Type',
    'info.desc': 'Description',
    'worlds.play': 'Play',
    'worlds.edit': 'Edit',
    'worlds.export': 'Export',
    'worlds.delete': 'Delete',
    'worlds.deleteConfirm': "Delete world '{name}'?",
    'worlds.importOk': 'Imported {n} world(s).',
    'worlds.importSome': 'Imported {ok}, {fail} failed (not a valid world file).',
    'worlds.variants': '{n} variants',
    'worlds.updated': 'Updated: {date}',
    'info.size': 'Size (rows×cols)',
    'info.robot': 'Robot start',
    'info.objects': 'Objects',
    'info.walls': 'Walls',
    'info.goal': 'Goal',
    'info.variants': 'Variants',
    'info.goalObjects': '{n} object cell(s)',
    'info.goalPos': 'Finish ({x},{y})',
    'info.goalFinish': '{n} finish spot(s)',
    'info.goalWalls': 'Build walls',
    'editor.title': 'Python code',
    'editor.download': 'Download code',
    'app.freePlayFile': 'reeborg_code',
    'popup.successTitle': 'Success!',
    'popup.successMsg': 'You reached the goal!',
    'popup.failTitle': 'Try again!',
    'popup.errorTitle': 'Oops, something went wrong',
    'popup.failMsg': "Not there yet. Fix your code and give it another try!",
    'popup.doneTitle': 'Done',
    'popup.doneMsg': 'Execution finished.',
    'popup.ok': 'OK',
    'app.solutionConfirm': 'Load the solution into the editor? Your current code will be replaced.',
    'err.out_of_bounds': "That's the edge of the world — check if there's a path ahead.",
    'err.blocked_by_wall': 'Blocked by a wall! Try another way.',
    'err.no_object_here': 'There is nothing to pick up here.',
    'err.no_token_to_put': 'No token to put down.',
    'err.no_item_to_put': 'Nothing to put down — pick something up with take() first.',
    'err.default': 'Something went wrong while running.',
    'py.atLine': 'Line {line}: ',
    'py.syntax': '{at}Syntax error. Check your parentheses, quotes, and colons (:).',
    'py.indent': '{at}Indentation problem. Use 4 spaces per level.',
    'py.nameNamed': "{at}'{name}' is not defined. Check the spelling.",
    'py.name': '{at}You used a name that is not defined. Check the spelling.',
    'py.type': '{at}A function was used incorrectly. Check the values in the parentheses.',
    'py.value': '{at}A value given to a function is not valid.',
    'py.zerodiv': '{at}You cannot divide by zero.',
    'py.index': '{at}You used a position (index) that does not exist.',
    'py.attr': '{at}That attribute does not exist. Check the name after the dot (.).',
    'py.recursion': '{at}A function called itself too many times.',
    'py.generic': '{at}Something went wrong while running.',
    'py.tooMany': 'Too many actions (over {max}). Check for a loop that never ends (while True).',
    'mk.title': 'Map Maker',
    'mk.name': 'World name',
    'mk.new': 'New',
    'mk.clear': 'Clear',
    'mk.save': 'Save',
    'mk.json': 'JSON',
    'mk.delete': 'Delete',
    'mk.back': 'To Learn',
    'mk.newConfirm': 'Start a new world? Unsaved changes will be lost.',
    'mk.clearConfirm': 'Clear everything in the current variant?',
    'mk.secDraw': 'Drawing tools',
    'mk.secTiles': 'Floor tiles',
    'mk.secPlace': 'Place objects (start)',
    'mk.secGoal': 'Goals',
    'mk.secSettings': 'World settings',
    'mk.wall': 'Wall', 'mk.wallHint': 'edge',
    'mk.robot': 'Robot', 'mk.robotHint': 'place',
    'mk.dir': 'Turn', 'mk.dirHint': 'rotate',
    'mk.erase': 'Erase', 'mk.eraseHint': 'clear cell',
    'mk.arrive': 'Finish cell',
    'mk.goalWall': 'Goal wall',
    'mk.empty': 'Empty',
    'mk.rows': 'Rows',
    'mk.cols': 'Cols',
    'mk.tokens': 'Robot tokens',
    'mk.variants': 'Variants',
    'mk.variant': 'Variant {n}',
    'mk.addVariant': '+ Add variant',
    'mk.variantHint': 'One variant is picked at random when playing',
    'mk.deleteVariant': 'Delete this variant',
    'mk.duplicateVariant': 'Duplicate this variant',
    'mk.descLabel': 'Mission description (Markdown)',
    'mk.descPreview': 'Preview',
    'mk.descPlaceholder': '# Title\nWrite here. **bold**, *italic* work too.\n- lists work\n\n(blank line = new paragraph)',
    'mk.solLabel': 'Solution code (optional)',
    'mk.validate': 'Check solution',
    'mk.solEmpty': 'Enter solution code to check first.',
    'mk.checking': 'Running the solution to check…',
    'mk.checkPass': 'The solution reaches the goal!',
    'mk.checkFail': 'The solution does not reach the goal.',
    'mk.checkVariantOk': 'Goal reached',
    'mk.checkVariantFail': 'Goal not reached',
    'mk.checkNoGoal': 'This variant has no goal.',
    'mk.checkLine': 'line {line}',
    'mk.zoomIn': 'Zoom in',
    'mk.zoomOut': 'Zoom out',
    'mk.zoomReset': 'Reset to 100%',
    'mk.nameRequired': 'Please enter a world name.',
    'mk.saveFail': 'Save failed (storage full).',
    'mk.saved': 'Saved!',
    'mk.deleteConfirm': 'Delete this world?',
    'ctx.place': 'Place {kind}',
    'ctx.count': 'Count',
    'ctx.random': 'Random count',
    'ctx.goal': '{kind} goal',
    'ctx.all': 'Collect all',
    'ctx.hint.wall': 'Click a cell edge to build a wall.',
    'ctx.hint.goalWall': 'Goal wall: click an edge (shown as a green dashed line).',
    'ctx.hint.goalEmpty': 'Empty-cell goal: click a cell that must end up empty.',
    'ctx.hint.goalPos': 'Click the cell the robot must reach.',
    'ctx.hint.robot': 'Click a cell for the robot start position.',
    'ctx.hint.erase': 'Click a cell to clear its objects, tiles and goals.',
    'ctx.hint.tile': 'Click a cell to paint it.',
    'ctx.hint.none': 'Pick a tool.',
    'kind.token': 'token', 'kind.carrot': 'carrot', 'kind.apple': 'apple',
    'kind.banana': 'banana', 'kind.leaf': 'leaf', 'kind.dandelion': 'dandelion',
    'tile.grass': 'Grass', 'tile.pale_grass': 'Pale grass', 'tile.ice': 'Ice',
    'tile.mud': 'Mud', 'tile.water': 'Water', 'tile.gravel': 'Gravel', 'tile.bricks': 'Bricks'
  }
};

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
}

// Pure translate — usable outside React (status messages, etc.).
export function tr(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const dict = STRINGS[lang] ?? STRINGS.ko;
  return interpolate(dict[key] ?? STRINGS.ko[key] ?? key, vars);
}

export function getStoredLang(): Lang {
  try {
    return localStorage.getItem(KEY) === 'en' ? 'en' : 'ko';
  } catch {
    return 'ko';
  }
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = React.createContext<I18nValue>({ lang: 'ko', setLang: () => {}, t: (k) => k });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>(() => getStoredLang());
  const setLang = React.useCallback((l: Lang) => {
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
    setLangState(l);
  }, []);
  const value = React.useMemo<I18nValue>(() => ({
    lang,
    setLang,
    t: (key, vars) => tr(lang, key, vars)
  }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  return React.useContext(Ctx);
}

// A square globe button that opens a language menu. Used in both page headers.
export function LangToggle() {
  const { lang, setLang } = useI18n();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function pick(l: Lang) {
    setLang(l);
    setOpen(false);
  }

  return (
    <div className="lang-toggle" ref={ref}>
      <button
        className="btn lang-btn"
        aria-label="Language"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      ><Globe size={18} /></button>
      {open && (
        <div className="lang-menu" role="menu">
          <button role="menuitemradio" aria-checked={lang === 'ko'} className={`lang-opt${lang === 'ko' ? ' active' : ''}`} onClick={() => pick('ko')}>
            <span className="lang-check">{lang === 'ko' ? <Check size={14} /> : null}</span>한국어
          </button>
          <button role="menuitemradio" aria-checked={lang === 'en'} className={`lang-opt${lang === 'en' ? ' active' : ''}`} onClick={() => pick('en')}>
            <span className="lang-check">{lang === 'en' ? <Check size={14} /> : null}</span>English
          </button>
        </div>
      )}
    </div>
  );
}
