import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeScript, countErrors, countWarnings } from '../src/dsl/diagnostics.js';
import { parseRegister } from '../src/register.js';

const REGISTER = parseRegister(JSON.stringify({
  characters: [
    { id: 'alice', display_name: '爱丽丝', sprites: { default: 'a.png', happy: 'h.png' } },
    { id: 'bob', display_name: '鲍勃', sprites: { default: 'b.png' } }
  ],
  scenes: [{ id: 'bg_classroom', type: 'background' }],
  audios: [
    { id: 'bgm_daily', type: 'bgm', volume: 0.7 },
    { id: 'sfx_door', type: 'sfx', volume: 1 }
  ],
  decorations: [{ id: 'vignette', description: '暗角' }],
  variables: { affection_alice: 0 },
  flags: []
}));

test('有效剧本没有错误', () => {
  const text = [
    '# comment',
    '@scene bg_classroom fade 1.0',
    '@show alice happy center',
    'alice(happy):"你好"',
    '@choice',
    '- "A" >> a',
    '@end',
    '> a',
    '@end'
  ].join('\n');
  const diags = analyzeScript(text, REGISTER);
  assert.deepEqual(diags, []);
});

test('未闭合 @choice 报错', () => {
  const diags = analyzeScript('@choice\n- "A" >> a\n', REGISTER);
  assert.ok(diags.some((d) => d.message.includes('未闭合')));
});

test('未注册角色报错', () => {
  const diags = analyzeScript('stranger:"你好"', REGISTER);
  assert.ok(diags.some((d) => d.message.includes("角色 'stranger' 未注册")));
});

test('未注册表情报错', () => {
  const diags = analyzeScript('alice(angry):"你好"', REGISTER);
  assert.ok(diags.some((d) => d.message.includes("没有注册表情 'angry'")));
});

test('未知场景和音频类型不匹配', () => {
  const diags = analyzeScript('@scene nowhere\n@bgm sfx_door', REGISTER);
  assert.ok(diags.some((d) => d.message.includes("场景 'nowhere' 未注册")));
  assert.ok(diags.some((d) => d.message.includes('这里期望 bgm')));
});

test('跳转目标不存在报错', () => {
  const diags = analyzeScript('>> missing', REGISTER);
  assert.ok(diags.some((d) => d.message.includes("跳转目标 'missing' 不存在")));
});

test('重复标签报错', () => {
  const text = '> a\n> a\n';
  const diags = analyzeScript(text, REGISTER);
  assert.ok(diags.some((d) => d.message.includes("标签 'a' 重复定义")));
});

test('选项缺少跳转报错', () => {
  const diags = analyzeScript('@choice\n- "没有跳转"\n@end', REGISTER);
  assert.ok(diags.some((d) => d.message.includes('必须包含 >> 标签')));
});

test('register 缺失时只保留语法诊断', () => {
  const empty = { ok: false, characters: new Map(), scenes: new Map(), audios: new Map(), decorations: new Map(), variables: new Map(), flags: new Set() };
  const diags = analyzeScript('stranger:"你好"\n@choice\n', empty);
  assert.ok(!diags.some((d) => d.message.includes('未注册')));
  assert.ok(diags.some((d) => d.message.includes('未闭合')));
});

test('@signal 缺少信号名报错', () => {
  const diags = analyzeScript('@signal\n', REGISTER);
  assert.ok(diags.some((d) => d.message.includes('@signal 需要一个信号名')));
});

test('@signal 正常写法不报错', () => {
  const diags = analyzeScript('@signal quest_start', REGISTER);
  assert.equal(diags.length, 0);
});

test('countErrors/countWarnings', () => {
  const diags = analyzeScript('@choice\n', REGISTER);
  assert.equal(countErrors(diags), 1);
  assert.equal(countWarnings(diags), 0);
});
