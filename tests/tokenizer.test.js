import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizeLine, getCommandName, parseDialogueLine, parseLabelLine, parseChoiceLine } from '../src/dsl/tokenizer.js';

test('注释整行高亮为 comment', () => {
  const tokens = tokenizeLine('# 这是注释');
  assert.equal(tokens[0].type, 'comment');
  assert.equal(tokens[0].from, 0);
  assert.equal(tokens[0].to, 6);
});

test('旁白星号与文本', () => {
  const tokens = tokenizeLine('*这是一个平凡的黄昏。');
  assert.equal(tokens[0].type, 'narrationMark');
  assert.equal(tokens[1].type, 'narration');
});

test('对话行解析角色、冒号、字符串', () => {
  const tokens = tokenizeLine('alice:"你好，世界。"');
  const types = tokens.map((t) => t.type).filter(Boolean);
  assert.ok(types.includes('roleId'));
  assert.ok(types.includes('string'));
});

test('带表情对话', () => {
  const tokens = tokenizeLine('alice(happy):"今天天气真好！"');
  const types = tokens.map((t) => t.type).filter(Boolean);
  assert.ok(types.includes('roleId'));
  assert.ok(types.includes('expression'));
  assert.ok(types.includes('string'));
});

test('指令与参数', () => {
  const tokens = tokenizeLine('@scene bg_classroom fade 1.0');
  const types = tokens.map((t) => t.type).filter(Boolean);
  assert.ok(types.includes('commandMarker'));
  assert.ok(types.includes('command'));
  assert.ok(types.includes('resourceId'));
  assert.ok(types.includes('number'));
});

test('选项行', () => {
  const tokens = tokenizeLine('- "好啊，一起去！" >> choice_library');
  const types = tokens.map((t) => t.type).filter(Boolean);
  assert.ok(types.includes('choiceMarker'));
  assert.ok(types.includes('string'));
  assert.ok(types.includes('jumpArrow'));
  assert.ok(types.includes('labelName'));
});

test('标签定义和跳转', () => {
  assert.equal(tokenizeLine('> choice_library').find((t) => t.type === 'labelName').to, 16);
  assert.ok(tokenizeLine('>> choice_library').some((t) => t.type === 'jumpArrow'));
});

test('变量插值', () => {
  const tokens = tokenizeLine('alice:"第{day}章"');
  const types = tokens.map((t) => t.type).filter(Boolean);
  assert.ok(types.includes('variableName'));
});

test('@signal 指令与信号名', () => {
  const tokens = tokenizeLine('@signal quest_start');
  const types = tokens.map((t) => t.type).filter(Boolean);
  assert.ok(types.includes('command'));
  assert.ok(types.includes('signalName'));
});

test('getCommandName 识别 @else if', () => {
  assert.equal(getCommandName('@scene bg'), 'scene');
  assert.equal(getCommandName('@else if a > 1'), 'else if');
  assert.equal(getCommandName('alice:"hi"'), null);
});

test('parseDialogueLine', () => {
  assert.deepEqual(parseDialogueLine('alice(happy):"你好"'), { role: 'alice', expression: 'happy', text: '你好' });
  assert.deepEqual(parseDialogueLine('alice:"你好"'), { role: 'alice', expression: null, text: '你好' });
  assert.equal(parseDialogueLine('@scene x'), null);
});

test('parseLabelLine', () => {
  assert.deepEqual(parseLabelLine('> hello'), { type: 'define', label: 'hello' });
  assert.deepEqual(parseLabelLine('>> hello'), { type: 'jump', label: 'hello' });
});

test('parseChoiceLine', () => {
  const choice = parseChoiceLine('- "你好" >> label_a');
  assert.equal(choice.hasJump, true);
  assert.equal(choice.label, 'label_a');
  assert.equal(parseChoiceLine('- 没有跳转').hasJump, false);
});
