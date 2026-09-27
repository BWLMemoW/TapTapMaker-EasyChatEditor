// 剧情文本统计：统计剧本中真实会播放给玩家的文本字数（对话、旁白、选项）
// 纯函数、无 DOM 依赖，便于单元测试与复用。

import { parseDialogueLine, parseChoiceLine } from './tokenizer.js';

// 预计游玩时长：按平均阅读速度估算（字/分钟）。
// 对话 + 旁白 + 选项的混合阅读速度取折中值；可被调用方覆盖。
export const DEFAULT_CHARS_PER_MINUTE = 240;

function isCommentLine(trimmed) {
  return trimmed.startsWith('#');
}

function isCommandLine(trimmed) {
  return trimmed.startsWith('@');
}

function isLabelLine(trimmed) {
  return trimmed.startsWith('>');
}

/**
 * 从一段剧情文本中剥离 DSL / 富文本标记，只保留用户可见的正文。
 * - 富文本标签 [color=...] / [/color] / [p=0.5] 等属于样式指令，不计入。
 * - 变量插值 {变量} 视为 1 个占位符（计 1 字），不把花括号/变量名本身算作正文。
 * @param {string} text
 * @returns {string}
 */
export function stripStoryText(text) {
  if (!text) return '';
  // 去掉成对的富文本标签与单标签（[xxx ...]）
  let s = text.replace(/\[[^\]]*\]/g, '');
  // 去掉变量插值，只留 1 个占位字符
  s = s.replace(/\{[^{}]*\}/g, '\uFFFD');
  return s;
}

/**
 * 统计一行中的纯文本字数（不含空白符）。
 * @param {string} text
 * @returns {number}
 */
export function countVisibleChars(text) {
  if (!text) return 0;
  return [...stripStoryText(text).replace(/\s+/g, '')].length;
}

/**
 * 统计整个剧本的剧情文本。
 * @param {string} script
 * @returns {{dialogues:number,narrations:number,choices:number,total:number,lines:number}}
 */
export function analyzeStoryStats(script) {
  const lines = String(script || '').split('\n');
  let dialogues = 0;
  let narrations = 0;
  let choices = 0;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || isCommentLine(trimmed) || isCommandLine(trimmed) || isLabelLine(trimmed)) {
      continue;
    }

    // 旁白：* 开头
    if (trimmed.startsWith('*')) {
      narrations += countVisibleChars(trimmed.slice(1));
      continue;
    }

    // 选项：- 开头
    if (trimmed.startsWith('-')) {
      const choice = parseChoiceLine(trimmed);
      // 优先取双引号里的选项文本，若为裸文本则剔除 >> 跳转与 @if 条件
      let text = choice?.text || '';
      if (text) {
        choices += countVisibleChars(text);
      }
      continue;
    }

    // 对话：角色:"文本"
    const dialogue = parseDialogueLine(trimmed);
    if (dialogue && dialogue.text != null) {
      dialogues += countVisibleChars(dialogue.text);
    }
  }

  return {
    dialogues,
    narrations,
    choices,
    total: dialogues + narrations + choices,
    lines: lines.length
  };
}

/**
 * 根据文本字数估算预计游玩时长（分钟，可含小数）。
 * @param {number} chars
 * @param {number} [charsPerMinute] 阅读速度（字/分钟），默认 240
 * @returns {number} 分钟
 */
export function estimatePlayTimeMinutes(chars, charsPerMinute = DEFAULT_CHARS_PER_MINUTE) {
  if (!chars || chars <= 0) return 0;
  const rate = charsPerMinute > 0 ? charsPerMinute : DEFAULT_CHARS_PER_MINUTE;
  return chars / rate;
}

/**
 * 把分钟数格式化为"X 分钟"或"约 X 分 Y 秒"。
 * @param {number} minutes
 * @returns {string}
 */
export function formatPlayTime(minutes) {
  if (!minutes || minutes <= 0) return '约 0 分钟';
  const totalSeconds = Math.max(1, Math.round(minutes * 60));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `约 ${s} 秒`;
  if (s === 0) return `约 ${m} 分钟`;
  return `约 ${m} 分 ${s} 秒`;
}
