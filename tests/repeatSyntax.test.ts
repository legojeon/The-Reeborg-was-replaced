import assert from 'node:assert/strict';
import test from 'node:test';

import { transformRepeatSyntax } from '../src/core/py/repeatSyntax.ts';

test('transforms a repeat statement into a Python range loop', () => {
  assert.equal(
    transformRepeatSyntax('repeat 3:\n    move()'),
    'for _ in range(3):\n    move()'
  );
});

test('preserves indentation, nested repeat statements, comments, and line numbers', () => {
  const source = [
    'repeat rows:  # outer',
    '    repeat 2:',
    '        move()',
    'print("repeat 4:")',
    '# repeat 5:'
  ].join('\n');

  const transformed = transformRepeatSyntax(source);

  assert.equal(transformed, [
    'for _ in range(rows):  # outer',
    '    for _ in range(2):',
    '        move()',
    'print("repeat 4:")',
    '# repeat 5:'
  ].join('\n'));
  assert.equal(transformed.split('\n').length, source.split('\n').length);
});
