// Easy-ChatBox DSL 诊断 / 校验器
// 纯函数：输入剧本全文 + register 索引，输出 CodeMirror lint 诊断数组。

import {
  getCommandName,
  parseDialogueLine,
  parseLabelLine,
  parseChoiceLine,
  POSITIONS,
  EFFECTS
} from './tokenizer.js';
import { getExpressions } from '../register.js';

const ROLE_COMMANDS = new Set(['show', 'hide', 'move', 'highlight', 'action', 'scale', 'setlayer']);

/**
 * 分析剧本全文。
 * @param {string} text
 * @param {object} register parseRegister 的返回
 * @returns {Array<{from:number,to:number,severity:'error'|'warning',message:string}>}
 */
export function analyzeScript(text, register) {
  const diagnostics = [];
  const lines = text.split('\n');
  const stack = [];
  const labels = new Map(); // name -> line
  const jumps = []; // {line, label}
  const duplicateLabels = new Set();

  // 预计算每行起始偏移，避免每条诊断都从第 0 行累加（大文件 + 多诊断时避免 O(n^2) 卡顿）
  const lineOffsets = new Array(lines.length + 1);
  lineOffsets[0] = 0;
  for (let i = 0; i < lines.length; i++) {
    lineOffsets[i + 1] = lineOffsets[i] + lines[i].length + 1;
  }

  function offsetAt(lineIdx, col) {
    return lineOffsets[lineIdx] + Math.max(0, Math.min(col, lines[lineIdx].length));
  }

  function addDiag(lineIdx, fromCol, toCol, severity, message) {
    diagnostics.push({
      from: offsetAt(lineIdx, fromCol),
      to: offsetAt(lineIdx, toCol),
      severity,
      message
    });
  }

  const knownRegister = register && register.ok;

  function checkRoleExists(lineIdx, role, colStart, colEnd) {
    if (!knownRegister) return;
    if (!register.characters.has(role)) {
      addDiag(lineIdx, colStart, colEnd, 'error', `角色 '${role}' 未注册`);
    }
  }

  function checkExpressionExists(lineIdx, role, expr, colStart, colEnd) {
    if (!knownRegister || !expr) return;
    if (expr === 'default') return; // default 通常作为兜底允许
    const expressions = getExpressions(register, role);
    if (!expressions.includes(expr)) {
      addDiag(lineIdx, colStart, colEnd, 'error', `角色 '${role}' 没有注册表情 '${expr}'`);
    }
  }

  function checkAudio(lineIdx, audioId, type, colStart, colEnd) {
    if (!knownRegister || !audioId) return;
    const audio = register.audios.get(audioId);
    if (!audio) {
      addDiag(lineIdx, colStart, colEnd, 'error', `音频 '${audioId}' 未注册`);
    } else if (type && audio.type !== type) {
      addDiag(lineIdx, colStart, colEnd, 'warning', `音频 '${audioId}' 类型是 ${audio.type}，这里期望 ${type}`);
    }
  }

  function checkResource(lineIdx, id, map, kind, colStart, colEnd) {
    if (!knownRegister || !id) return;
    if (!map.has(id)) {
      addDiag(lineIdx, colStart, colEnd, 'error', `${kind} '${id}' 未注册`);
    }
  }

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const raw = lines[lineIdx];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // 标签
    const label = parseLabelLine(raw);
    if (label) {
      if (label.type === 'define') {
        if (labels.has(label.label)) duplicateLabels.add(label.label);
        labels.set(label.label, lineIdx);
        if (!label.label) {
          addDiag(lineIdx, 0, raw.length, 'error', '标签定义缺少名称');
        }
      } else {
        jumps.push({ line: lineIdx, label: label.label });
        if (!label.label) {
          addDiag(lineIdx, 0, raw.length, 'error', '标签跳转缺少目标');
        }
      }
      continue;
    }

    // 指令
    const command = getCommandName(raw);
    if (command) {
      const args = trimmed.slice(trimmed.indexOf('@') + 1 + command.length).trim();
      const argMatch = args.match(/([\p{L}\p{N}_]+)/u);
      const firstArg = argMatch ? argMatch[1] : null;
      const firstCol = raw.indexOf(firstArg || '');
      const firstStart = firstCol >= 0 ? firstCol : raw.length;
      const firstEnd = firstStart + (firstArg ? firstArg.length : 0);

      if (command === 'choice') {
        stack.push({ type: 'choice', line: lineIdx, hasOption: false });
      } else if (command === 'if') {
        stack.push({ type: 'if', line: lineIdx });
      } else if (command === 'else if' || command === 'else') {
        const top = stack[stack.length - 1];
        if (!top || top.type !== 'if') {
          addDiag(lineIdx, 0, raw.length, 'error', `@${command} 必须位于 @if 块内`);
        } else {
          top.lastElse = command === 'else';
          if (command === 'else' && top.hasElse) {
            addDiag(lineIdx, 0, raw.length, 'error', '@else 只能出现一次');
          }
          top.hasElse = top.hasElse || command === 'else';
        }
      } else if (command === 'endif') {
        const top = stack.pop();
        if (!top || top.type !== 'if') {
          addDiag(lineIdx, 0, raw.length, 'error', '@endif 没有匹配的 @if');
        }
      } else if (command === 'end') {
        const top = stack[stack.length - 1];
        if (top && top.type === 'choice') {
          if (!top.hasOption) {
            addDiag(top.line, 0, lines[top.line].length, 'error', '@choice 块至少需要一个选项');
          }
          stack.pop();
        }
      } else if (command === 'timeout') {
        const top = stack[stack.length - 1];
        if (!top || top.type !== 'choice') {
          addDiag(lineIdx, 0, raw.length, 'error', '@timeout 只能在 @choice 块内使用');
        } else if (!/>>/.test(args)) {
          addDiag(lineIdx, 0, raw.length, 'error', '@timeout 必须包含 >> 标签');
        }
      } else if (command === 'signal') {
        if (!args.trim()) {
          addDiag(lineIdx, 0, raw.length, 'error', '@signal 需要一个信号名');
        }
      }

      if (ROLE_COMMANDS.has(command) && firstArg) {
        if (firstArg !== 'all') {
          checkRoleExists(lineIdx, firstArg, firstStart, firstEnd);
          if (command === 'show' && knownRegister && register.characters.has(firstArg)) {
            const expr = args.split(/\s+/).find((part) => part !== firstArg && /^[\p{L}\p{N}_]+$/u.test(part) && getExpressions(register, firstArg).includes(part));
            if (expr) {
              checkExpressionExists(lineIdx, firstArg, expr, raw.indexOf(expr), raw.indexOf(expr) + expr.length);
            }
          }
        }
      } else if (command === 'scene' && firstArg) {
        checkResource(lineIdx, firstArg, register.scenes, '场景', firstStart, firstEnd);
      } else if ((command === 'bgm' || command === 'sfx') && firstArg && !['stop', 'fade', 'unfade'].includes(firstArg)) {
        checkAudio(lineIdx, firstArg, command, firstStart, firstEnd);
      } else if (command === 'decoration' && firstArg && firstArg !== 'none') {
        checkResource(lineIdx, firstArg, register.decorations, '装饰', firstStart, firstEnd);
      }

      // 检查 @show 中未知的纯数字参数不是必须的，跳过
      continue;
    }

    // 选项
    if (trimmed.startsWith('-')) {
      const top = stack[stack.length - 1];
      if (!top || top.type !== 'choice') {
        addDiag(lineIdx, 0, raw.length, 'warning', '选项行出现在 @choice 块外');
      } else {
        top.hasOption = true;
      }
      const choice = parseChoiceLine(raw);
      if (!choice.hasJump) {
        addDiag(lineIdx, 0, raw.length, 'error', '选项必须包含 >> 标签');
      } else {
        jumps.push({ line: lineIdx, label: choice.label });
      }
      continue;
    }

    // 对话
    const dialogue = parseDialogueLine(raw);
    if (dialogue) {
      const roleStart = raw.search(/[\p{L}\p{N}_]+/u);
      const roleEnd = roleStart + dialogue.role.length;
      checkRoleExists(lineIdx, dialogue.role, roleStart, roleEnd);
      if (dialogue.expression) {
        const exprMatch = raw.match(/\(([\p{L}\p{N}_]+)\)/u);
        const exprStart = exprMatch ? exprMatch.index + 1 : roleEnd;
        const exprEnd = exprStart + dialogue.expression.length;
        checkExpressionExists(lineIdx, dialogue.role, dialogue.expression, exprStart, exprEnd);
      }
      if (dialogue.text === null) {
        addDiag(lineIdx, roleEnd, raw.length, 'error', '对话缺少引号文本，应为 角色:"文本"');
      }
      continue;
    }

    // 裸文本 / 未知语句
    if (trimmed.startsWith('*')) continue; // 旁白已由 tokenizer 高亮，这里无需诊断
    if (/^[\p{L}\p{N}_]+\s*:/u.test(trimmed) && !/:\s*"/.test(trimmed)) {
      addDiag(lineIdx, 0, raw.length, 'error', '对话格式不完整，应为 角色:"文本"');
    } else if (!/^[\p{L}\p{N}_]+\s*:/u.test(trimmed)) {
      addDiag(lineIdx, 0, raw.length, 'warning', '无法识别的语句');
    }
  }

  // 未闭合块
  for (const block of stack) {
    const closer = block.type === 'choice' ? '@end' : '@endif';
    addDiag(block.line, 0, lines[block.line].length, 'error', `未闭合的 @${block.type}，缺少 ${closer}`);
  }

  // 标签重复
  for (const label of duplicateLabels) {
    const line = labels.get(label);
    addDiag(line, 0, lines[line].length, 'error', `标签 '${label}' 重复定义`);
  }

  // 跳转目标存在性
  for (const jump of jumps) {
    if (!labels.has(jump.label)) {
      const lineText = lines[jump.line] || '';
      const idx = lineText.indexOf(jump.label);
      const from = idx >= 0 ? idx : 0;
      addDiag(jump.line, from, from + jump.label.length, 'error', `跳转目标 '${jump.label}' 不存在`);
    }
  }

  return diagnostics;
}

export function countErrors(diagnostics) {
  return diagnostics.filter((d) => d.severity === 'error').length;
}

export function countWarnings(diagnostics) {
  return diagnostics.filter((d) => d.severity === 'warning').length;
}
