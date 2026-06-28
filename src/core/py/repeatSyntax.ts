// Reeborg compatibility syntax:
//
//   repeat 3:
//       move()
//
// Pyodide executes standard Python, so convert only whole repeat-statement
// lines. The transformation keeps the same number of lines so Python errors
// and editor highlights still point at the student's original source.
export function transformRepeatSyntax(code: string): string {
  return code.split('\n').map((line) => {
    const match = line.match(/^(\s*)repeat\s+(.+?)\s*:(\s*(?:#.*)?)$/);
    if (!match) return line;
    const [, indent, expression, trailing] = match;
    return `${indent}for _ in range(${expression.trim()}):${trailing}`;
  }).join('\n');
}
