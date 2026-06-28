import React from 'react';
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, keymap, Decoration, type DecorationSet } from '@codemirror/view';
import { EditorState, StateEffect, StateField, RangeSet } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { indentUnit, bracketMatching } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, acceptCompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { Download } from 'lucide-react';
import { useI18n } from '../i18n';
import { PythonLogo } from './icons/PythonLogo';

interface Props {
  code: string;
  onChange: (next: string) => void;
  // 1-based line currently executing (green highlight)
  activeLine?: number | null;
  // 1-based line with an error (red highlight)
  errorLine?: number | null;
  // Filename used when downloading the code (e.g. "ato101.py")
  downloadName?: string;
}

// ---- line highlight (executing / error) ----

const setLineHighlights = StateEffect.define<{ active: number | null; error: number | null }>();

const activeLineDeco = Decoration.line({ class: 'cm-exec-line' });
const errorLineDeco = Decoration.line({ class: 'cm-error-line' });

const lineHighlightField = StateField.define<DecorationSet>({
  create() {
    return RangeSet.empty;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setLineHighlights)) {
        const ranges = [];
        const { active, error } = e.value;
        const doc = tr.state.doc;
        if (error != null && error >= 1 && error <= doc.lines) {
          ranges.push(errorLineDeco.range(doc.line(error).from));
        } else if (active != null && active >= 1 && active <= doc.lines) {
          ranges.push(activeLineDeco.range(doc.line(active).from));
        }
        deco = Decoration.set(ranges);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f)
});

// ---- autocompletion for the Reeborg API ----

const API_COMPLETIONS = [
  { label: 'move()', type: 'function', info: '앞으로 한 칸 이동해요.' },
  { label: 'turn_left()', type: 'function', info: '왼쪽으로 90도 돌아요.' },
  { label: 'take()', type: 'function', info: '지금 칸에 있는 물건을 주워요.' },
  { label: 'put()', type: 'function', info: '가지고 있는 물건을 내려놓아요.' },
  { label: 'build_wall()', type: 'function', info: '바라보는 방향에 벽을 만들어요.' },
  { label: 'done()', type: 'function', info: '여기서 실행을 끝내요.' },
  { label: 'think(100)', type: 'function', info: '한 동작마다 기다리는 시간을 정해요. (숫자가 클수록 천천히)' },
  { label: 'wall_in_front()', type: 'function', info: '앞에 벽이 있으면 True예요.' },
  { label: 'wall_on_right()', type: 'function', info: '오른쪽에 벽이 있으면 True예요.' },
  { label: 'front_is_clear()', type: 'function', info: '앞이 비어 있으면 True예요.' },
  { label: 'object_here()', type: 'function', info: '지금 칸에 물건이 있으면 True예요.' },
  { label: 'at_goal()', type: 'function', info: '도착 지점에 있으면 True예요.' },
  { label: 'print()', type: 'function', info: '결과 창에 글자를 보여줘요.' }
];

// `label` is the matched/typed text; `apply` is what gets inserted. Keeping the
// label to a single keyword stops multi-word templates (e.g. the for-loop) from
// fuzzy-matching a word in the middle of a line and duplicating text.
const KEYWORD_COMPLETIONS = [
  { label: 'repeat', apply: 'repeat 3:', detail: '3:', type: 'keyword', info: '지정한 횟수만큼 반복하기' },
  { label: 'if', apply: 'if ', type: 'keyword', info: '만약 ~라면' },
  { label: 'elif', apply: 'elif ', type: 'keyword', info: '그렇지 않고 만약 ~라면' },
  { label: 'else', apply: 'else:', type: 'keyword', info: '그렇지 않으면' },
  { label: 'while', apply: 'while ', type: 'keyword', info: '~하는 동안 반복' },
  { label: 'for', apply: 'for i in range(10):', detail: 'i in range(10):', type: 'keyword', info: '10번 반복하기' },
  { label: 'range', apply: 'range(10)', detail: '(10)', type: 'function', info: '0부터 9까지 숫자 (반복 횟수)' },
  { label: 'def', apply: 'def ', type: 'keyword', info: '나만의 함수 만들기' },
  { label: 'not', apply: 'not ', type: 'keyword', info: '반대(True ↔ False)' },
  { label: 'and', apply: 'and ', type: 'keyword', info: '그리고' },
  { label: 'or', apply: 'or ', type: 'keyword', info: '또는' },
  { label: 'True', type: 'constant', info: '참' },
  { label: 'False', type: 'constant', info: '거짓' }
];

function reeborgCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return {
    from: word.from,
    options: [...API_COMPLETIONS, ...KEYWORD_COMPLETIONS],
    validFor: /^[A-Za-z_][A-Za-z0-9_]*$/
  };
}

export function Editor({ code, onChange, activeLine = null, errorLine = null, downloadName = 'reeborg.py' }: Props) {
  const { t } = useI18n();
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);

  // Save the current editor contents as a .py file.
  function handleDownload() {
    const text = viewRef.current?.state.doc.toString() ?? code;
    const blob = new Blob([text], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  React.useEffect(() => {
    if (!hostRef.current) return;
    const theme = EditorView.theme({
      '&': { height: '100%', borderRadius: '8px', overflow: 'hidden', fontSize: '15px' },
      '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
      '.cm-content': { padding: '10px 0' },
      '.cm-exec-line': { backgroundColor: 'rgba(34, 197, 94, 0.18)' },
      '.cm-error-line': { backgroundColor: 'rgba(239, 68, 68, 0.25)' }
    });
    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ override: [reeborgCompletions] }),
        indentUnit.of('    '),
        EditorState.tabSize.of(4),
        // Tab accepts an open autocompletion; otherwise it falls through to indent.
        keymap.of([...closeBracketsKeymap, ...completionKeymap, { key: 'Tab', run: acceptCompletion }, ...historyKeymap, indentWithTab, ...defaultKeymap]),
        python(),
        oneDark, // bundles its own syntax highlighting

        theme,
        lineHighlightField,
        EditorView.updateListener.of((v) => {
          if (v.docChanged) {
            onChange(v.state.doc.toString());
          }
        })
      ]
    });
    viewRef.current = new EditorView({
      state,
      parent: hostRef.current
    });
    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  // External code updates (world change, solution apply)
  React.useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur !== code) {
      v.dispatch({ changes: { from: 0, to: cur.length, insert: code } });
    }
  }, [code]);

  // Executing / error line highlight
  React.useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    v.dispatch({ effects: setLineHighlights.of({ active: activeLine, error: errorLine }) });
    // Keep the highlighted line visible during long programs
    const target = errorLine ?? activeLine;
    if (target != null && target >= 1 && target <= v.state.doc.lines) {
      v.dispatch({ effects: EditorView.scrollIntoView(v.state.doc.line(target).from, { y: 'nearest' }) });
    }
  }, [activeLine, errorLine]);

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 6, minHeight: 0, minWidth: 0 }}>
      <div className="editor-header">
        <strong className="panel-title"><PythonLogo size={16} /> {t('editor.title')}</strong>
        <button
          type="button"
          className="editor-download"
          onClick={handleDownload}
          aria-label={t('editor.download')}
          title={t('editor.download')}
        >
          <Download size={16} />
        </button>
      </div>
      <div ref={hostRef} style={{ height: '100%', minHeight: 0 }} />
    </div>
  );
}
