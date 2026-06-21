// Render a mission/world description to safe HTML.
//
// New worlds authored in the map maker store Markdown; older built-in worlds
// store HTML. Both render correctly because Markdown passes inline HTML through
// (so existing "<br>" / "<h1>…" descriptions keep working). `breaks: false`
// keeps standard Markdown behavior — a blank line starts a new paragraph — so the
// built-in worlds look exactly as before. The output is sanitized with DOMPurify
// before it ever reaches dangerouslySetInnerHTML.
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: false });

export function renderMarkdown(src: string | null | undefined): string {
  if (!src) return '';
  const html = marked.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(html);
}
