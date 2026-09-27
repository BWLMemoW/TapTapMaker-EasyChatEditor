import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { desiredIndentForLine } from '../src/editor.js';

function stateWith(doc) {
  return EditorState.create({ doc });
}

test('@if 块内正文缩进一级，@else/@endif 与 @if 对齐', () => {
  const state = stateWith('@if a > 0\n    alice:"hi"\n@else\n    bob:"bye"\n@endif\n');
  assert.equal(desiredIndentForLine(state, 1), 0);
  assert.equal(desiredIndentForLine(state, 2), 4);
  assert.equal(desiredIndentForLine(state, 3), 0);
  assert.equal(desiredIndentForLine(state, 4), 4);
  assert.equal(desiredIndentForLine(state, 5), 0);
});

test('@choice 块内选项缩进一级，@end 与 @choice 对齐', () => {
  const state = stateWith('@choice\n    - "A" >> a\n@end\n');
  assert.equal(desiredIndentForLine(state, 1), 0);
  assert.equal(desiredIndentForLine(state, 2), 4);
  assert.equal(desiredIndentForLine(state, 3), 0);
});
