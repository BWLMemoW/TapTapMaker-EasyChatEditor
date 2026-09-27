// Easy-ChatBox DSL 词法分析器
// 纯函数、无 DOM 依赖，可同时用于语法高亮、补全与测试。

export const COMMANDS = [
  // 按常用程度排序，供补全展示使用
  'scene', 'show', 'wait', 'choice', 'end', 'if', 'else if', 'else', 'endif',
  'set', 'bgm', 'sfx', 'hide', 'move', 'highlight', 'action', 'scale', 'setlayer',
  'transition', 'shake', 'flash', 'tint', 'decoration', 'textbox', 'auto',
  'timeout', 'call', 'return', 'savepoint', 'signal'
];

export const POSITIONS = ['far_left', 'left', 'center', 'right', 'far_right'];
export const EFFECTS = [
  'none', 'fade', 'dissolve', 'slide_left', 'slide_right', 'slide_up',
  'slide_down', 'zoom_in', 'zoom_out', 'black', 'white', 'linear',
  'ease_in', 'ease_out', 'ease_in_out'
];
export const BOOLEANS = ['true', 'false'];

const IDENT_RE = /[\p{L}\p{N}_]+/u;
const NUMBER_RE = /(?:\d+\.\d*|\.\d+|\d+)/;

const ROLE_COMMANDS = new Set(['show', 'hide', 'move', 'highlight', 'action', 'scale', 'setlayer']);

function isSpace(ch) {
  return /\s/.test(ch);
}

function isIdentStart(ch) {
  return ch !== undefined && /[\p{L}_]/u.test(ch);
}

function isIdentPart(ch) {
  return ch !== undefined && /[\p{L}\p{N}_]/u.test(ch);
}

function isNumberStart(ch) {
  return ch !== undefined && /[0-9.]/.test(ch);
}

/**
 * 把一行 Easy-ChatBox DSL 文本切成带位置的 token。
 * @param {string} line
 * @returns {Array<{from:number,to:number,type:string|null}>}
 */
export function tokenizeLine(line) {
  const tokens = [];
  let i = 0;

  function push(from, to, type) {
    if (to > from) tokens.push({ from, to, type });
  }

  function skipSpaces() {
    const start = i;
    while (i < line.length && isSpace(line[i])) i++;
    push(start, i, null);
  }

  function scanIdent(type) {
    const start = i;
    while (i < line.length && isIdentPart(line[i])) i++;
    if (i > start) push(start, i, type);
    return i > start;
  }

  function scanNumber() {
    const start = i;
    const m = line.slice(i).match(NUMBER_RE);
    if (m) {
      i += m[0].length;
      push(start, i, 'number');
      return true;
    }
    return false;
  }

  function scanVariable() {
    if (line[i] !== '{') return;
    const open = i;
    i++;
    push(open, i, 'punctuation');
    scanIdent('variableName');
    if (line[i] === '}') {
      const close = i;
      i++;
      push(close, i, 'punctuation');
    }
  }

  function scanRichTag() {
    if (line[i] !== '[') return;
    const start = i;
    while (i < line.length && line[i] !== ']') i++;
    if (line[i] === ']') i++;
    push(start, i, 'meta');
  }

  function scanString() {
    // 进入时 line[i] 是引号
    const open = i;
    i++;
    push(open, i, 'string');
    while (i < line.length) {
      const ch = line[i];
      if (ch === '"') {
        const close = i;
        i++;
        push(close, i, 'string');
        return;
      }
      if (ch === '\\' && i + 1 < line.length) {
        const start = i;
        i += 2;
        push(start, i, 'string');
        continue;
      }
      if (ch === '{') {
        scanVariable();
        continue;
      }
      if (ch === '[') {
        scanRichTag();
        continue;
      }
      const start = i;
      while (i < line.length && !['"', '\\', '{', '['].includes(line[i])) i++;
      push(start, i, 'string');
    }
    // 未闭合
    push(i, line.length, 'invalid');
  }

  function scanInlineText(baseType) {
    while (i < line.length) {
      const ch = line[i];
      if (ch === '{') {
        scanVariable();
      } else if (ch === '[') {
        scanRichTag();
      } else {
        const start = i;
        while (i < line.length && !['{', '['].includes(line[i])) i++;
        push(start, i, baseType);
      }
    }
  }

  function scanOperators() {
    const two = line.slice(i, i + 2);
    if (['>=', '<=', '==', '!=', '&&', '||', '+=', '-=', '..'].includes(two)) {
      push(i, i + 2, 'operator');
      i += 2;
      return true;
    }
    if (['=', '+', '-', '*', '/', '%', '!', '>', '<'].includes(line[i])) {
      push(i, i + 1, 'operator');
      i++;
      return true;
    }
    return false;
  }

  function classifyCommandArg(command, argIndex, word) {
    if (word === 'true' || word === 'false') return 'bool';
    switch (command) {
      case 'scene':
        return argIndex === 0 ? 'resourceId' : 'effect';
      case 'bgm':
        if (argIndex === 0) return ['stop', 'fade', 'unfade'].includes(word) ? 'command' : 'resourceId';
        return 'number';
      case 'sfx':
        return argIndex === 0 ? 'resourceId' : 'number';
      case 'decoration':
        return argIndex === 0 ? 'resourceId' : 'number';
      case 'call':
        return argIndex === 0 ? 'resourceId' : null;
      case 'show':
      case 'hide':
      case 'move':
      case 'highlight':
      case 'action':
      case 'scale':
      case 'setlayer': {
        if (argIndex === 0) return 'resourceId';
        if (word === 'all') return 'resourceId';
        if (POSITIONS.includes(word)) return 'position';
        if (EFFECTS.includes(word)) return 'effect';
        return 'expression';
      }
      case 'set':
        return argIndex === 0 ? 'variableName' : null;
      case 'if':
      case 'else if':
        return 'variableName';
      case 'timeout':
        return argIndex === 0 ? 'number' : null;
      case 'wait':
        return 'number';
      case 'auto':
        if (['on', 'off', 'speed'].includes(word)) return 'command';
        return null;
      case 'textbox':
        if (['show', 'hide', 'style'].includes(word)) return 'command';
        return null;
      case 'tint':
        if (['on', 'off', 'none'].includes(word)) return 'command';
        return 'expression';
      case 'transition':
      case 'flash':
      case 'shake':
        return argIndex === 0 ? 'effect' : 'number';
      case 'signal':
        return argIndex === 0 ? 'signalName' : null;
      default:
        return null;
    }
  }

  function scanCommand() {
    const at = i;
    i++;
    push(at, i, 'commandMarker');

    const kwStart = i;
    while (i < line.length && /[A-Za-z_]/.test(line[i])) i++;
    const keyword = line.slice(kwStart, i);
    if (i > kwStart) push(kwStart, i, 'command');

    let command = keyword.toLowerCase();
    // 支持 @else if 这种带空格的指令
    if (command === 'else' && /^\s+if\b/.test(line.slice(i))) {
      skipSpaces();
      const ifStart = i;
      i += 2;
      push(ifStart, i, 'command');
      command = 'else if';
    }

    let argIndex = 0;
    while (i < line.length) {
      skipSpaces();
      if (i >= line.length) break;
      const ch = line[i];
      if (ch === '#' && /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?/.test(line.slice(i))) {
        const start = i;
        while (i < line.length && !/\s/.test(line[i]) && line[i] !== '#') i++;
        push(start, i, 'color');
        argIndex++;
        continue;
      }
      if (ch === '#') {
        // 行内注释（增强支持）
        push(i, line.length, 'comment');
        break;
      }
      if (ch === '"') {
        scanString();
        argIndex++;
        continue;
      }
      if (ch === '{') {
        scanVariable();
        argIndex++;
        continue;
      }
      if (ch === '[') {
        scanRichTag();
        argIndex++;
        continue;
      }
      if (isNumberStart(ch)) {
        scanNumber();
        argIndex++;
        continue;
      }
      if (scanOperators()) {
        argIndex++;
        continue;
      }
      if (isIdentStart(ch)) {
        const start = i;
        while (i < line.length && isIdentPart(line[i])) i++;
        const word = line.slice(start, i);
        push(start, i, classifyCommandArg(command, argIndex, word) || 'atom');
        argIndex++;
        continue;
      }
      // 其它符号（括号、逗号等）
      push(i, i + 1, 'punctuation');
      i++;
      argIndex++;
    }
  }

  function scanDialogue() {
    // 角色 ID
    if (isIdentStart(line[i])) {
      scanIdent('roleId');
    }
    // 表情
    if (line[i] === '(') {
      push(i, i + 1, 'punctuation');
      i++;
      skipSpaces();
      scanIdent('expression');
      skipSpaces();
      if (line[i] === ')') {
        push(i, i + 1, 'punctuation');
        i++;
      }
    }
    skipSpaces();
    if (line[i] === ':') {
      push(i, i + 1, 'punctuation');
      i++;
      skipSpaces();
      if (line[i] === '"') {
        scanString();
      } else {
        // 缺少引号的对话
        const start = i;
        while (i < line.length && line[i] !== '#') i++;
        push(start, i, 'invalid');
      }
    } else if (i < line.length) {
      // 不像对话，也不像其它结构；按无效文本处理
      const start = i;
      while (i < line.length && !['{', '['].includes(line[i])) i++;
      push(start, i, 'invalid');
      scanInlineText('invalid');
    }
  }

  function scanChoice() {
    // '-'
    push(i, i + 1, 'choiceMarker');
    i++;
    skipSpaces();

    if (line[i] === '"') {
      scanString();
      skipSpaces();
    } else {
      const start = i;
      while (i < line.length && !line.startsWith('>>', i) && line[i] !== '@' && line[i] !== '#') i++;
      push(start, i, 'choiceText');
      skipSpaces();
    }

    if (line.startsWith('>>', i)) {
      push(i, i + 2, 'jumpArrow');
      i += 2;
      skipSpaces();
      scanIdent('labelName');
    } else if (line[i] === '@') {
      // 选项后面的 @if 条件
      scanCommand();
    } else if (line[i] === '#') {
      push(i, line.length, 'comment');
    } else if (i < line.length) {
      const start = i;
      while (i < line.length && line[i] !== '#') i++;
      push(start, i, 'invalid');
    }
  }

  skipSpaces();
  if (i >= line.length) return tokens;

  const first = line[i];
  if (first === '#') {
    push(i, line.length, 'comment');
    return tokens;
  }
  if (first === '*') {
    push(i, i + 1, 'narrationMark');
    i++;
    scanInlineText('narration');
    return tokens;
  }
  if (first === '>' && line[i + 1] === '>') {
    push(i, i + 2, 'jumpArrow');
    i += 2;
    skipSpaces();
    scanIdent('labelName');
    return tokens;
  }
  if (first === '>') {
    push(i, i + 1, 'labelDefine');
    i++;
    skipSpaces();
    scanIdent('labelName');
    return tokens;
  }
  if (first === '@') {
    scanCommand();
    return tokens;
  }
  if (first === '-') {
    scanChoice();
    return tokens;
  }
  scanDialogue();
  return tokens;
}

/**
 * 获取一行中的指令名（小写），不是指令行返回 null。
 * @param {string} line
 * @returns {string|null}
 */
export function getCommandName(line) {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith('@')) return null;
  const m = trimmed.match(/^@([A-Za-z]+)/);
  if (!m) return null;
  let cmd = m[1].toLowerCase();
  if (cmd === 'else' && /^\s+if\b/.test(trimmed.slice(m[0].length))) cmd = 'else if';
  return cmd;
}

/**
 * 解析对话行的角色 ID / 表情。
 * @param {string} line
 */
export function parseDialogueLine(line) {
  const trimmed = line.trim();
  const m = trimmed.match(/^([\p{L}\p{N}_]+)(?:\(([^)]*)\))?\s*:\s*"(.*)"/u);
  if (m) return { role: m[1], expression: m[2] || null, text: m[3] };
  const roleOnly = trimmed.match(/^([\p{L}\p{N}_]+)\s*:/u);
  if (roleOnly) return { role: roleOnly[1], expression: null, text: null };
  return null;
}

/**
 * 解析跳转 / 标签行。
 */
export function parseLabelLine(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('>>')) return { type: 'jump', label: trimmed.slice(2).trim() };
  if (trimmed.startsWith('>') && !trimmed.startsWith('>>')) return { type: 'define', label: trimmed.slice(1).trim() };
  return null;
}

/**
 * 解析选项行。
 */
export function parseChoiceLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('-')) return null;
  const m = trimmed.match(/^-\s*(?:"([^"]*)"|([^>]*?))\s*>>\s*([^\s@]+)/);
  if (m) {
    return {
      text: m[1] ?? m[2]?.trim() ?? '',
      label: m[3],
      hasJump: true,
      condition: trimmed.includes('@if') ? trimmed.slice(trimmed.indexOf('@if') + 3).trim() : null
    };
  }
  return { text: trimmed.slice(1).trim(), label: null, hasJump: false, condition: null };
}

/**
 * 获取一行中的角色 ID（对话行开头），不是对话返回 null。
 */
export function getDialogueRole(line) {
  const parsed = parseDialogueLine(line);
  return parsed?.role ?? null;
}
