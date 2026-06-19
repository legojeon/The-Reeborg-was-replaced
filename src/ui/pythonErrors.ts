// Convert raw Pyodide tracebacks into kid-friendly, localized messages.
import { tr, type Lang } from './i18n';

export interface ParsedPyError {
  kind: string;
  line?: number;
  friendly: string;
  // Short technical detail (the traceback's last line) for the result panel.
  detail: string;
}

const NAME_RE = /name '([^']+)' is not defined/;

function friendlyFor(kind: string, message: string, line: number | undefined, lang: Lang): string {
  const at = line ? tr(lang, 'py.atLine', { line }) : '';
  switch (kind) {
    case 'SyntaxError':
    case 'IndentationError':
    case 'TabError': {
      if (kind === 'IndentationError') return tr(lang, 'py.indent', { at });
      return tr(lang, 'py.syntax', { at });
    }
    case 'NameError': {
      const m = message.match(NAME_RE);
      const name = m?.[1];
      return name ? tr(lang, 'py.nameNamed', { at, name }) : tr(lang, 'py.name', { at });
    }
    case 'TypeError': return tr(lang, 'py.type', { at });
    case 'ValueError': return tr(lang, 'py.value', { at });
    case 'ZeroDivisionError': return tr(lang, 'py.zerodiv', { at });
    case 'IndexError':
    case 'KeyError': return tr(lang, 'py.index', { at });
    case 'AttributeError': return tr(lang, 'py.attr', { at });
    case 'RecursionError': return tr(lang, 'py.recursion', { at });
    default: return tr(lang, 'py.generic', { at });
  }
}

export function parsePythonError(raw: string, lang: Lang = 'ko'): ParsedPyError {
  const text = String(raw ?? '');

  // Our own infinite-loop guard throws a stable marker; localize it here.
  const tooMany = text.match(/__TOO_MANY_ACTIONS__:(\d+)/);
  if (tooMany) {
    const msg = tr(lang, 'py.tooMany', { max: tooMany[1] });
    return { kind: 'TooManyActions', friendly: msg, detail: msg };
  }

  const lines = text.split('\n').map(l => l.trimEnd()).filter(l => l.trim().length > 0);
  // Last "ErrorType: message" line of the traceback
  let kind = 'Error';
  let message = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^([A-Za-z_][A-Za-z0-9_]*(?:Error|Exception|Interrupt|Exit|Warning))\s*:?\s*(.*)$/);
    if (m) {
      kind = m[1];
      message = m[2] ?? '';
      break;
    }
  }

  // Last user-code line reference. User code runs as "<exec>"; SyntaxError reports
  // the offending line on a `File "<exec>", line N` row too.
  let line: number | undefined;
  const lineRefs = text.match(/File "<exec>", line (\d+)/g);
  if (lineRefs && lineRefs.length > 0) {
    const last = lineRefs[lineRefs.length - 1].match(/line (\d+)/);
    if (last) line = parseInt(last[1], 10);
  }

  const detail = message ? `${kind}: ${message}` : kind;
  return { kind, line, friendly: friendlyFor(kind, message, line, lang), detail };
}
