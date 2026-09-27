import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCompletionCandidates } from '../src/dsl/completion.js';
import { parseRegister } from '../src/register.js';

const REGISTER = parseRegister(JSON.stringify({
  ui_elements: {
    custom_buttons: [
      { id: 'ec_shop_btn', style: 'default', label: '商店', signal: 'open_shop' }
    ]
  },
  characters: [
    { id: 'alice', display_name: '爱丽丝', sprites: { default: 'd.png', happy: 'h.png' } },
    { id: 'bob', display_name: '鲍勃', sprites: { default: 'b.png' } }
  ],
  scenes: [{ id: 'bg_classroom', type: 'background' }, { id: 'bg_campus', type: 'background' }],
  audios: [
    { id: 'bgm_daily', type: 'bgm', volume: 0.7 },
    { id: 'sfx_door', type: 'sfx' }
  ],
  decorations: [{ id: 'vignette', description: '暗角' }],
  variables: { affection_alice: 0 },
  flags: ['met_bob']
}));

const LABELS = ['start', 'end'];

test('局部变量参与补全', () => {
  const localVars = ['score', 'tmp_flag'];
  const ifResult = getCompletionCandidates('@if sco', 7, REGISTER, LABELS, localVars);
  assert.ok(ifResult);
  assert.ok(ifResult.options.some((o) => o.label === 'score'));

  const braceResult = getCompletionCandidates('alice:"{tmp', 11, REGISTER, LABELS, localVars);
  assert.ok(braceResult);
  assert.ok(braceResult.options.some((o) => o.label === 'tmp_flag'));
});

test('指令补全按常用程度排序', () => {
  const result = getCompletionCandidates('@', 1, REGISTER, LABELS);
  const labels = result.options.map((o) => o.label);
  const indexOf = (name) => labels.findIndex((label) => label.startsWith(name));
  assert.ok(indexOf('@scene') >= 0);
  assert.ok(indexOf('@scale') >= 0);
  assert.ok(indexOf('@scene') < indexOf('@scale'));
  assert.ok(indexOf('@choice') < indexOf('@call'));
});

test('@sce 补全指令时替换范围包含 @', () => {
  const result = getCompletionCandidates('@sce', 4, REGISTER, LABELS);
  assert.ok(result);
  assert.equal(result.from, 0);
  assert.ok(result.options.some((o) => o.label === '@scene'));
});

test('已有指令后不再补 @指令（一行只写一句）', () => {
  // 光标在第二个 @ 之后：不应再弹任何补全
  const result = getCompletionCandidates('@scene bg_campus @', 18, REGISTER, LABELS);
  assert.equal(result, null);
});

test('@scene 后补全场景', () => {
  const result = getCompletionCandidates('@scene bg_', 11, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === 'bg_classroom'));
  assert.ok(result.options.some((o) => o.label === 'bg_campus'));
});

test('对话行开头补全角色', () => {
  const result = getCompletionCandidates('ali', 3, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === 'alice'));
});

test('角色名( 后补全表情', () => {
  const result = getCompletionCandidates('alice(h', 7, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === 'happy'));
});

test('{ 后补全变量', () => {
  const result = getCompletionCandidates('alice:"{aff', 11, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === 'affection_alice'));
});

test('>> 后补全标签', () => {
  const result = getCompletionCandidates('>> s', 4, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === 'start'));
});

test('@bgm 后只补全 bgm 音频', () => {
  const result = getCompletionCandidates('@bgm bgm_', 9, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === 'bgm_daily'));
  assert.ok(!result.options.some((o) => o.label === 'sfx_door'));
});

test('@signal 后补全自定义按钮信号', () => {
  const result = getCompletionCandidates('@signal open_', 13, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === 'open_shop'));
});

test('指令补全包含 @signal', () => {
  const result = getCompletionCandidates('@sig', 4, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === '@signal'));
});

test('大型结构语句提供块模板补全', () => {
  const ifResult = getCompletionCandidates('@if', 3, REGISTER, LABELS);
  assert.ok(ifResult.options.some((o) => o.label.startsWith('@if 条件块')));

  const choiceResult = getCompletionCandidates('@choice', 7, REGISTER, LABELS);
  assert.ok(choiceResult.options.some((o) => o.label.startsWith('@choice 选项块')));
});

test('选项行输入 - "文本" 后补 >> 符号', () => {
  const result = getCompletionCandidates('- "你好"', 6, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === '>>'));
});

test('选项行内联 @if 后补全变量', () => {
  const line = '- "你好" >> label_a @if aff';
  const result = getCompletionCandidates(line, line.length, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === 'affection_alice'));
});

test('@timeout 后补全秒数', () => {
  const result = getCompletionCandidates('@timeout ', 9, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === '8'));
});

test('@scene 场景后补全转场效果', () => {
  const result = getCompletionCandidates('@scene bg_campus ', 17, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === 'fade'));
  assert.ok(result.options.some((o) => o.label === 'dissolve'));
});

test('@show 角色后补全表情/位置/效果', () => {
  const result = getCompletionCandidates('@show alice ', 12, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === 'happy'));
  assert.ok(result.options.some((o) => o.label === 'center'));
  assert.ok(result.options.some((o) => o.label === 'slide_left'));
});

test('@hide 角色后补全退场效果', () => {
  const result = getCompletionCandidates('@hide alice ', 12, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === 'fade'));
  assert.ok(result.options.some((o) => o.label === 'slide_right'));
});

test('@move 角色后补全位置', () => {
  const result = getCompletionCandidates('@move alice ', 12, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === 'far_left'));
  assert.ok(result.options.some((o) => o.label === 'center'));
});

test('@action 角色后补全动作名', () => {
  const result = getCompletionCandidates('@action alice ', 14, REGISTER, LABELS);
  assert.ok(result);
  assert.ok(result.options.some((o) => o.label === 'jump'));
  assert.ok(result.options.some((o) => o.label === 'shake'));
});

test('固定枚举补全：textbox/auto/flash/tint/transition', () => {
  assert.ok(getCompletionCandidates('@textbox ', 9, REGISTER, LABELS).options.some((o) => o.label === 'show'));
  assert.ok(getCompletionCandidates('@auto ', 6, REGISTER, LABELS).options.some((o) => o.label === 'speed'));
  assert.ok(getCompletionCandidates('@flash ', 7, REGISTER, LABELS).options.some((o) => o.label === 'white'));
  assert.ok(getCompletionCandidates('@tint ', 6, REGISTER, LABELS).options.some((o) => o.label === 'off'));
  assert.ok(getCompletionCandidates('@transition ', 13, REGISTER, LABELS).options.some((o) => o.label === 'fade_in'));
});
