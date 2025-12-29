import React from 'react';
import { EditorView, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorSelection, EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';

interface Props {
  code: string;
  onChange: (next: string) => void;
}

export function Editor({ code, onChange }: Props) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<EditorView | null>(null);
  const historyRef = React.useRef<string[]>([]);
  const redoRef = React.useRef<string[]>([]);
  const suppressHistoryRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    if (!hostRef.current) return;
    const theme = EditorView.theme({
      '&': { height: '100%', border: '1px solid #e5e7eb', borderRadius: '6px' },
      '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '13px' },
      '.cm-content': { padding: '10px' }
    });
    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        EditorView.domEventHandlers({
          keydown: (event, view) => {
            const isMod = event.ctrlKey || event.metaKey;
            // Undo
            if (isMod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
              event.preventDefault();
              const cur = view.state.doc.toString();
              const prev = historyRef.current.pop();
              if (prev != null) {
                suppressHistoryRef.current = true;
                view.dispatch({ changes: { from: 0, to: cur.length, insert: prev } });
                suppressHistoryRef.current = false;
                redoRef.current.push(cur);
                onChange(prev);
              }
              return true;
            }
            // Redo (Ctrl+Shift+Z or Ctrl+Y)
            if ((isMod && event.key.toLowerCase() === 'z' && event.shiftKey) || (isMod && event.key.toLowerCase() === 'y')) {
              event.preventDefault();
              const cur = view.state.doc.toString();
              const next = redoRef.current.pop();
              if (next != null) {
                suppressHistoryRef.current = true;
                view.dispatch({ changes: { from: 0, to: cur.length, insert: next } });
                suppressHistoryRef.current = false;
                historyRef.current.push(cur);
                onChange(next);
              }
              return true;
            }
            if (event.key === 'Tab' && !event.shiftKey) {
              event.preventDefault();
              const doc = view.state.doc;
              const tab = '    ';
              const ranges = view.state.selection.ranges;
              const allCarets = ranges.every(r => r.empty);
              // If single-caret (or multi-caret) with no selection spanning lines, insert spaces at caret(s)
              if (allCarets && ranges.length >= 1) {
                const changes = ranges
                  .map(r => ({ from: r.from, insert: tab }))
                  // apply in reverse order to keep positions valid
                  .sort((a, b) => b.from - a.from);
                const newSelections = ranges.map(r => EditorSelection.cursor(r.from + tab.length));
                view.dispatch({
                  changes,
                  selection: EditorSelection.create(newSelections),
                  scrollIntoView: true
                });
                return true;
              }
              // Otherwise indent all touched lines by inserting at line starts
              const lineStarts = new Set<number>();
              for (const r of ranges) {
                const fromLine = doc.lineAt(r.from).number;
                const toLine = doc.lineAt(r.to).number;
                for (let ln = fromLine; ln <= toLine; ln++) {
                  lineStarts.add(doc.line(ln).from);
                }
              }
              const changes = Array.from(lineStarts)
                .sort((a, b) => b - a)
                .map((from) => ({ from, insert: tab }));
              if (changes.length > 0) {
                view.dispatch({ changes, scrollIntoView: true });
                return true;
              }
              return false;
            }
            if (event.key === 'Tab' && event.shiftKey) {
              event.preventDefault();
              const doc = view.state.doc;
              const lines = new Set<number>();
              for (const r of view.state.selection.ranges) {
                const fromLine = doc.lineAt(r.from).number;
                const toLine = doc.lineAt(r.to).number;
                for (let ln = fromLine; ln <= toLine; ln++) {
                  lines.add(ln);
                }
              }
              const changes: Array<{ from: number; to: number }> = [];
              const ordered = Array.from(lines).sort((a, b) => b - a);
              for (const ln of ordered) {
                const line = doc.line(ln);
                const from = line.from;
                const to = Math.min(line.from + 4, line.to);
                const text = doc.sliceString(from, to);
                if (text.startsWith('\t')) {
                  changes.push({ from, to: from + 1 });
                } else {
                  let remove = 0;
                  for (let i = 0; i < text.length; i++) {
                    if (text[i] === ' ') remove++;
                    else break;
                  }
                  if (remove > 0) {
                    changes.push({ from, to: from + remove });
                  }
                }
              }
              if (changes.length > 0) {
                view.dispatch({ changes, scrollIntoView: true });
                return true;
              }
              return false;
            }
            // Smart Enter: auto-indent new line for Python blocks
            if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
              const doc = view.state.doc;
              // Only handle when all selections are empty (carets)
              const allCarets = view.state.selection.ranges.every(r => r.empty);
              if (!allCarets) return false;
              event.preventDefault();
              const changes: Array<{ from: number; to?: number; insert: string }> = [];
              const cursors: number[] = [];
              for (const r of view.state.selection.ranges) {
                const pos = r.from;
                const line = doc.lineAt(pos);
                const before = doc.sliceString(line.from, pos);
                const lineText = doc.sliceString(line.from, line.to);
                // Compute base indent (leading spaces)
                const match = lineText.match(/^(\s*)/);
                const baseIndent = match ? match[1] : '';
                const trimmed = lineText.trimEnd();
                // Heuristics: indent after common Python block starters or when line ends with ':'
                const blockStarter = /^\s*(if|elif|else|for|while|try|except|finally|def|class)\b/i.test(lineText) || trimmed.endsWith(':');
                const nextIndent = blockStarter ? baseIndent + '    ' : baseIndent;
                const newline = '\n' + nextIndent;
                changes.push({ from: pos, insert: newline });
                cursors.push(pos + newline.length);
              }
              if (changes.length > 0) {
                const selection = EditorSelection.create(cursors.map(p => EditorSelection.cursor(p)));
                view.dispatch({ changes, selection, scrollIntoView: true });
                return true;
              }
              return false;
            }
            return false;
          }
        }),
        python(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        theme,
        EditorView.updateListener.of((v) => {
          if (v.docChanged) {
            // push previous doc to history if not programmatic undo/redo
            if (!suppressHistoryRef.current) {
              const prev = v.startState.doc.toString();
              historyRef.current.push(prev);
              // any edit invalidates redo stack
              redoRef.current.length = 0;
            }
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

  React.useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur !== code) {
      v.dispatch({ changes: { from: 0, to: cur.length, insert: code } });
    }
  }, [code]);

  return (
    <div style={{ padding: 12, display: 'grid', gridTemplateRows: 'auto 1fr', gap: 8, minHeight: 0 }}>
      <strong>Python Editor</strong>
      <div ref={hostRef} style={{ height: '100%', minHeight: 0 }} />
    </div>
  );
}


