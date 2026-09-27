import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripStoryText,
  countVisibleChars,
  analyzeStoryStats,
  estimatePlayTimeMinutes,
  formatPlayTime
} from '../src/dsl/stats.js';

test('stripStoryText 去掉富文本标签', () => {
  assert.equal(stripStoryText('你好[color=#FF0000]世界[/color]！'), '你好世界！');
  assert.equal(stripStoryText('[p=0.5]正文[/p]'), '正文');
});

test('stripStoryText 变量插值记为 1 占位符', () => {
  assert.equal(stripStoryText('好感{affection_alice}上升'), '好感\uFFFD上升');
});

test('countVisibleChars 去除空白后计数', () => {
  assert.equal(countVisibleChars('你好 世界'), 4);
  assert.equal(countVisibleChars('abc def'), 6);
  assert.equal(countVisibleChars(''), 0);
  assert.equal(countVisibleChars(null), 0);
});

test('统计对话、旁白、选项，忽略指令与标签', () => {
  const script = [
    '# 这是注释',
    '@scene bg_classroom fade 1.0',
    '*夕阳洒进教室，她笑着向你打招呼。',
    '@show alice default center',
    'alice:"你好，我是爱丽丝。"',
    'alice(happy):"很高兴认识你！[color=#FF6B9D]今天天气真好！[/color]"',
    '>> say_hi',
    '',
    '@choice',
    '- "你好呀！" >> say_hi',
    '- "抱歉，我在忙……" >> say_busy',
    '@timeout 8 >> say_timeout',
    '@end'
  ].join('\n');

  const stats = analyzeStoryStats(script);
  // "你好，我是爱丽丝。" = 9 字；"很高兴认识你！" = 6+1，"今天天气真好！" = 6+1 => 14 字，合计 23
  assert.equal(stats.dialogues, 23);
  assert.ok(stats.narrations > 0);
  assert.ok(stats.choices > 0);
  assert.equal(stats.total, stats.dialogues + stats.narrations + stats.choices);
});

test('对话字数 = 引号内可见字符数', () => {
  const script = 'alice:"你好，世界。"';
  const stats = analyzeStoryStats(script);
  // "你好，世界。" = 你好(2) + ，(1) + 世界(2) + 。(1) = 6
  assert.equal(stats.dialogues, 6);
  assert.equal(stats.narrations, 0);
  assert.equal(stats.choices, 0);
  assert.equal(stats.total, 6);
});

test('旁白字数 = 星号后可见字符数', () => {
  const stats = analyzeStoryStats('*这是一个傍晚。');
  // 这是一个傍晚。 = 这是一个傍晚(6) + 。(1) = 7
  assert.equal(stats.narrations, 7);
});

test('选项字数 = 引号内选项文本', () => {
  const stats = analyzeStoryStats('- "你好呀！" >> say_hi');
  // 你好呀！ = 3 + ！ = 4
  assert.equal(stats.choices, 4);
});

test('指令与跳转不计入文本', () => {
  const stats = analyzeStoryStats('@scene bg_classroom fade 1.0\n>> the_end\n> the_end');
  assert.equal(stats.total, 0);
});

test('estimatePlayTimeMinutes 按阅读速度估算', () => {
  assert.equal(estimatePlayTimeMinutes(240), 1); // 240 字 / 240 字每分钟 = 1 分钟
  assert.equal(estimatePlayTimeMinutes(120), 0.5);
  assert.equal(estimatePlayTimeMinutes(0), 0);
  assert.equal(estimatePlayTimeMinutes(480, 480), 1);
});

test('formatPlayTime 格式化', () => {
  assert.equal(formatPlayTime(0), '约 0 分钟');
  assert.equal(formatPlayTime(0.05), '约 3 秒');
  assert.equal(formatPlayTime(1), '约 1 分钟');
  assert.equal(formatPlayTime(1.5), '约 1 分 30 秒');
});
