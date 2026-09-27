// Easy-ChatBox DSL 代码补全候选
// 核心逻辑是纯函数，便于测试；CodeMirror 适配层在 editor.js 中调用。

import { COMMANDS, POSITIONS, EFFECTS } from './tokenizer.js';
import { getExpressions, getDisplayName, getDefaultPosition } from '../register.js';

const COMMAND_INFO = {
  scene: '@scene 场景ID [转场] [时长]',
  show: '@show 角色ID [表情] [位置] [效果] [时长]',
  hide: '@hide 角色ID|all [效果] [时长]',
  move: '@move 角色ID 位置 [时长] [缓动]',
  highlight: '@highlight 角色ID|none',
  action: '@action 角色ID 动作名',
  scale: '@scale 角色ID [缩放比] [时长] [锚点]',
  setlayer: '@setlayer 角色ID 数值',
  bgm: '@bgm 音频ID|stop|fade|unfade',
  sfx: '@sfx 音频ID',
  transition: '@transition 效果 [时长]',
  shake: '@shake [强度] [时长]',
  flash: '@flash 颜色 [时长]',
  tint: '@tint 颜色 不透明度 [on] [时长]',
  decoration: '@decoration 装饰ID|none [时长]',
  textbox: '@textbox show|hide',
  auto: '@auto on|off|speed 秒数',
  set: '@set 变量名 = 表达式',
  if: '@if 条件',
  'else if': '@else if 条件',
  else: '@else',
  endif: '@endif',
  choice: '@choice',
  timeout: '@timeout 秒数 >> 标签',
  call: '@call 子剧本文件名',
  return: '@return',
  savepoint: '@savepoint',
  wait: '@wait 秒数',
  end: '@end',
  signal: '@signal 信号名'
};

function plainCompletion(label, detail, info, insert, cursorOffset = insert.length) {
  return {
    label,
    type: 'snippet',
    detail,
    info,
    apply(view, completion, from, to) {
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + cursorOffset },
        scrollIntoView: true
      });
    }
  };
}

const SNIPPETS = [
  plainCompletion(
    '@choice 选项块',
    '片段',
    '插入空的 @choice 块，选项自己填写',
    '@choice\n    \n@end',
    '@choice\n'.length + 4
  ),
  plainCompletion(
    '@if 条件块',
    '片段',
    '插入 @if / @endif 模板',
    '@if \n    \n@endif',
    '@if '.length
  ),
  plainCompletion(
    '@if/@else/@endif',
    '片段',
    '插入带 @else 的条件分支模板',
    '@if \n    \n@else\n    \n@endif',
    '@if '.length
  ),
  plainCompletion(
    '演出序列',
    '片段',
    '常见场景 + 立绘 + 等待 + 对话',
    '@scene  fade 1.0\n@show  default center slide_left\n@wait 0.6\n:"",\n@wait 0.3',
    '@scene '.length
  ),
  plainCompletion(
    '音频序列',
    '片段',
    'BGM + 音效常用写法',
    '@bgm  0.7\n@sfx \n@wait 0.3',
    '@bgm '.length
  )
];

// 大型结构语句：输入 @if/@choice 时直接给出块模板
const STRUCTURAL_SNIPPETS = {
  'if': plainCompletion(
    '@if 条件块',
    '片段',
    '插入 @if / @endif 模板',
    '@if \n    \n@endif',
    '@if '.length
  ),
  'choice': plainCompletion(
    '@choice 选项块',
    '片段',
    '插入空的 @choice 块，选项自己填写',
    '@choice\n    \n@end',
    '@choice\n'.length + 4
  ),
  'else if': plainCompletion(
    '@else if 条件',
    '片段',
    '插入 @else if 分支头',
    '@else if ',
    '@else if '.length
  ),
  'else': plainCompletion(
    '@else',
    '片段',
    '插入 @else',
    '@else',
    '@else'.length
  ),
  'endif': plainCompletion(
    '@endif',
    '片段',
    '插入 @endif',
    '@endif',
    '@endif'.length
  ),
  'end': plainCompletion(
    '@end',
    '片段',
    '插入 @end',
    '@end',
    '@end'.length
  )
};

// 固定字段 / 枚举
const TRANSITION_EFFECTS = ['fade', 'dissolve', 'fade_in', 'fade_out', 'iris_out', 'black', 'white', 'none'];
const ENTRY_EFFECTS = ['none', 'fade', 'dissolve', 'slide_left', 'slide_right', 'slide_up', 'slide_down', 'zoom_in', 'zoom_out', 'black', 'white'];
const EXIT_EFFECTS = ENTRY_EFFECTS;
const EASING_OPTIONS = ['linear', 'ease_in', 'ease_out', 'ease_in_out'];
const ACTION_OPTIONS = ['jump', 'shake'];
const COLOR_OPTIONS = ['white', 'black', 'red', 'green', 'blue', 'yellow', 'cyan', 'orange'];
const TEXTBOX_OPTIONS = ['show', 'hide'];
const AUTO_OPTIONS = ['on', 'off', 'speed'];
const SCALE_OPTIONS = ['1.0', '0.8', '1.2', '0.5'];
const LAYER_OPTIONS = ['1', '2', '3', '4', '5'];
const ASSIGN_OPTIONS = ['=', '+=', '-=', '+', '-'];
const OPERATOR_OPTIONS = ['>=', '<=', '==', '!=', '&&', '||', '!', '+', '-', '*', '/', '%'];
const BOOLEAN_OPTIONS = ['true', 'false'];
const VOLUME_OPTIONS = ['0.7', '0.8', '1.0', '0.5', '0.3'];

function fixedOptions(list, type, detail) {
  return list.map((label) => ({ label, type, detail: detail || label }));
}

function commandOptions() {
  return COMMANDS.map((cmd) => {
    const structural = STRUCTURAL_SNIPPETS[cmd];
    if (structural) return structural;
    return {
      label: `@${cmd}`,
      type: 'keyword',
      detail: COMMAND_INFO[cmd] || `@${cmd}`,
      info: COMMAND_INFO[cmd] || `@${cmd}`
    };
  });
}

function labelOptions(labels) {
  return [...new Set(labels)].map((label) => ({
    label,
    type: 'label',
    detail: '标签'
  }));
}

function variableOptions(register, localVars = []) {
  const seen = new Set();
  const all = [
    ...[...register.variables.keys()].map((name) => ({ name, isLocal: false })),
    ...[...register.flags].map((name) => ({ name, isLocal: false })),
    ...localVars.map((name) => ({ name, isLocal: true }))
  ];
  const options = [];
  for (const item of all) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    options.push({
      label: item.name,
      type: 'variable',
      detail: item.isLocal
        ? '局部变量'
        : register.variables.has(item.name)
          ? `变量 = ${JSON.stringify(register.variables.get(item.name))}`
          : '开关'
    });
  }
  return options;
}

function roleOptions(register) {
  return [...register.characters.keys()].map((id) => {
    const role = register.characters.get(id);
    const expressions = getExpressions(register, id);
    return {
      label: id,
      type: 'role',
      detail: getDisplayName(register, id),
      info: `表情：${expressions.join(', ') || '无'}；默认位置：${getDefaultPosition(register, id)}`
    };
  });
}

function sceneOptions(register) {
  return [...register.scenes.keys()].map((id) => {
    const scene = register.scenes.get(id);
    return {
      label: id,
      type: 'scene',
      detail: scene?.type || 'scene',
      info: `类型：${scene?.type || '未知'}${scene?.transition ? `；转场：${scene.transition}` : ''}`
    };
  });
}

function audioOptions(register, type) {
  return [...register.audios.values()]
    .filter((audio) => !type || audio?.type === type)
    .map((audio) => ({
      label: audio.id,
      type: 'audio',
      detail: audio?.type || 'audio',
      info: `类型：${audio?.type || '未知'}${audio?.volume != null ? `；音量：${audio.volume}` : ''}${audio?.loop != null ? `；循环：${audio.loop}` : ''}`
    }));
}

function decorationOptions(register) {
  return [...register.decorations.keys()].map((id) => {
    const deco = register.decorations.get(id);
    return {
      label: id,
      type: 'decoration',
      detail: deco?.description || '装饰',
      info: deco?.description || '装饰'
    };
  });
}

function expressionOptions(register, roleId) {
  return getExpressions(register, roleId).map((expr) => ({
    label: expr,
    type: 'expression',
    detail: roleId,
    info: `${roleId} 的表情`
  }));
}

function signalOptions(register) {
  const signals = (register.customButtons || [])
    .map((btn) => btn.signal)
    .filter((signal, index, arr) => signal && arr.indexOf(signal) === index);
  return signals.map((signal) => ({
    label: signal,
    type: 'signal',
    detail: '自定义按钮信号'
  }));
}

/**
 * 解析光标前的命令行，返回命令、已输入参数和当前参数位置。
 */
function parseCommandContext(before) {
  const m = before.match(/^\s*@([A-Za-z]+(?:\s+if)?)(?:\s+([\s\S]*))?$/u);
  if (!m) return null;
  const command = m[1].toLowerCase();
  const rest = m[2] || '';
  const trimmedRest = rest.trimEnd();
  const parts = trimmedRest ? trimmedRest.split(/\s+/) : [];
  const currentMatch = rest.match(/([\p{L}\p{N}_]*)$/u);
  const current = currentMatch ? currentMatch[0] : '';
  const endsWithSpace = /\s$/.test(rest);
  const argIndex = endsWithSpace ? parts.length : Math.max(0, parts.length - 1);
  return { command, parts, current, argIndex, endsWithSpace };
}

function filterByPrefix(options, prefix) {
  return options.filter((opt) => opt.label.startsWith(prefix));
}

/**
 * 纯函数：返回针对当前光标位置的补全候选。
 * @param {string} line 当前行文本
 * @param {number} pos 光标列（0-based）
 * @param {object} register 由 parseRegister 生成的索引
 * @param {string[]} labels 当前文档中已定义标签
 * @returns {{from:number, options:Array}|null}
 */
export function getCompletionCandidates(line, pos, register, labels, localVars = []) {
  const before = line.slice(0, pos);
  const wordMatch = before.match(/[\p{L}\p{N}_]*$/u);
  const word = wordMatch ? wordMatch[0] : '';
  const wordFrom = pos - word.length;
  const prefixBeforeWord = before.slice(0, wordFrom);
  const allVarOptions = variableOptions(register, localVars);

  // 1) 指令补全：@ 或 @xxx（替换范围要包含 @，避免插入成 @@scene）
  // 只在 @ 是行内第一个非空白字符时触发，避免“一行多句”时继续补 @指令。
  if (prefixBeforeWord.endsWith('@') && /^\s*$/.test(prefixBeforeWord.slice(0, -1))) {
    const options = filterByPrefix(commandOptions(), '@' + word);
    if (options.length) return { from: wordFrom - 1, options };
  }

  // 2) 变量插值：{ 或 {xxx
  if (prefixBeforeWord.endsWith('{')) {
    const options = filterByPrefix(allVarOptions, word);
    if (options.length) return { from: wordFrom, options };
  }

  // 3) 标签跳转：>> 或 >>xxx
  if (/>>\s*$/.test(prefixBeforeWord)) {
    const options = filterByPrefix(labelOptions(labels), word);
    if (options.length) return { from: wordFrom, options };
  }

  // 3.1) 选项行输入 - "文本" 后，自动补 >> 符号
  if (/^\s*-\s*"[^"]*"\s*$/u.test(before)) {
    return {
      from: pos,
      options: [
        {
          label: '>>',
          type: 'operator',
          detail: '选项跳转',
          apply: ' >> '
        }
      ]
    };
  }

  // 4) 角色表情：role( 或 role(exp
  const exprMatch = before.match(/([\p{L}\p{N}_]+)\(\s*([\p{L}\p{N}_]*)$/u);
  if (exprMatch && register.ok) {
    const roleId = exprMatch[1];
    const start = pos - exprMatch[2].length;
    const options = filterByPrefix(expressionOptions(register, roleId), exprMatch[2]);
    if (options.length) return { from: start, options };
  }

  // 5) 指令参数补全（按每个指令的详细语法逐位补全）
  // 命令行里再次出现 @ 视为手误/一行多句，不再给指令参数补全。
  const cmdCtx = parseCommandContext(before);
  if (cmdCtx && (before.match(/@/g) || []).length <= 1) {
    const opts = commandArgOptionsByContext(cmdCtx, register, localVars);
    const from = pos - cmdCtx.current.length;
    if (opts.length) return { from, options: opts };
  }

  // 5.1) 选项行内联条件：- "..." >> label @if aff
  const inlineIfMatch = before.match(/@if\s+([\p{L}\p{N}_]*)$/u);
  if (inlineIfMatch && /^\s*-\s*/.test(before)) {
    const prefix = inlineIfMatch[1];
    const from = pos - prefix.length;
    const opts = allVarOptions.filter((opt) => opt.label.startsWith(prefix));
    if (opts.length) return { from, options: opts };
  }

  // 6) 对话行开头：角色补全
  if (/^\s*$/.test(prefixBeforeWord) && register.ok) {
    const options = filterByPrefix(roleOptions(register), word);
    if (options.length) return { from: wordFrom, options };
  }

  // 7) 片断补全：仅当用户输入 @ 后没有匹配指令时，也提供片段
  if (before.trimStart().startsWith('@') && word.length === 0 && /^\s*$/.test(prefixBeforeWord.slice(0, -1))) {
    const options = filterByPrefix(commandOptions().concat(SNIPPETS), '@' + word);
    if (options.length) return { from: wordFrom - 1, options };
  }

  return null;
}

function commandArgOptionsByContext(ctx, register, localVars = []) {
  const { command, parts, argIndex } = ctx;
  const options = [];
  const role = parts[0];

  switch (command) {
    case 'scene':
      if (argIndex === 0) options.push(...sceneOptions(register));
      else if (argIndex === 1) options.push(...fixedOptions(TRANSITION_EFFECTS, 'effect', '转场效果'));
      break;

    case 'show': {
      if (argIndex === 0) {
        options.push(...roleOptions(register));
      } else {
        if (argIndex === 1) {
          if (role && register.ok) options.push(...expressionOptions(register, role));
          options.push(...fixedOptions(POSITIONS, 'position', '位置'));
          options.push(...fixedOptions(ENTRY_EFFECTS, 'effect', '入场效果'));
        } else if (argIndex === 2) {
          options.push(...fixedOptions(POSITIONS, 'position', '位置'));
          options.push(...fixedOptions(ENTRY_EFFECTS, 'effect', '入场效果'));
        } else if (argIndex === 3) {
          options.push(...fixedOptions(ENTRY_EFFECTS, 'effect', '入场效果'));
        }
      }
      break;
    }

    case 'hide':
      if (argIndex === 0) {
        options.push(...roleOptions(register));
        options.push({ label: 'all', type: 'command', detail: '全部角色' });
      } else if (argIndex === 1) {
        options.push(...fixedOptions(EXIT_EFFECTS, 'effect', '退场效果'));
      }
      break;

    case 'move':
      if (argIndex === 0) options.push(...roleOptions(register));
      else if (argIndex === 1) options.push(...fixedOptions(POSITIONS, 'position', '位置'));
      else if (argIndex >= 2) options.push(...fixedOptions(EASING_OPTIONS, 'effect', '缓动'));
      break;

    case 'highlight':
      if (argIndex === 0) {
        options.push(...roleOptions(register));
        options.push({ label: 'none', type: 'command', detail: '取消高亮' });
      }
      break;

    case 'action':
      if (argIndex === 0) options.push(...roleOptions(register));
      else if (argIndex === 1) options.push(...fixedOptions(ACTION_OPTIONS, 'effect', '动作'));
      break;

    case 'scale':
      if (argIndex === 0) options.push(...roleOptions(register));
      else if (argIndex === 1) options.push(...fixedOptions(SCALE_OPTIONS, 'number', '缩放比'));
      else if (argIndex >= 2) options.push(...fixedOptions(['center', 'feet'], 'position', '锚点'));
      break;

    case 'setlayer':
      if (argIndex === 0) options.push(...roleOptions(register));
      else if (argIndex === 1) options.push(...fixedOptions(LAYER_OPTIONS, 'number', '图层'));
      break;

    case 'bgm':
      if (argIndex === 0) {
        options.push(
          { label: 'stop', type: 'command', detail: '停止 BGM' },
          { label: 'fade', type: 'command', detail: '淡出/压低音量' },
          { label: 'unfade', type: 'command', detail: '恢复音量' },
          ...audioOptions(register, 'bgm')
        );
      } else if (argIndex === 1 && parts[0] === 'fade') {
        options.push(...fixedOptions(VOLUME_OPTIONS, 'number', '目标音量'));
      }
      break;

    case 'sfx':
      if (argIndex === 0) options.push(...audioOptions(register, 'sfx'));
      else if (argIndex === 1) options.push(...fixedOptions(VOLUME_OPTIONS, 'number', '音量'));
      break;

    case 'transition':
      if (argIndex === 0) options.push(...fixedOptions(TRANSITION_EFFECTS, 'effect', '转场效果'));
      break;

    case 'flash':
      if (argIndex === 0) options.push(...fixedOptions(COLOR_OPTIONS, 'color', '颜色'));
      break;

    case 'tint':
      if (argIndex === 0) {
        options.push(...fixedOptions(COLOR_OPTIONS, 'color', '颜色'));
        options.push({ label: 'off', type: 'command', detail: '关闭色调' });
        options.push({ label: 'none', type: 'command', detail: '清除色调' });
      }
      break;

    case 'decoration':
      if (argIndex === 0) {
        options.push({ label: 'none', type: 'command', detail: '清除装饰' });
        options.push(...decorationOptions(register));
      }
      break;

    case 'textbox':
      if (argIndex === 0) options.push(...fixedOptions(TEXTBOX_OPTIONS, 'command', '对话框'));
      break;

    case 'auto':
      if (argIndex === 0) options.push(...fixedOptions(AUTO_OPTIONS, 'command', '自动播放'));
      break;

    case 'set':
      if (argIndex === 0) options.push(...variableOptions(register, localVars));
      else if (argIndex === 1) {
        options.push(...fixedOptions(ASSIGN_OPTIONS, 'operator', '赋值'));
        options.push(...fixedOptions(BOOLEAN_OPTIONS, 'bool', '布尔'));
      }
      break;

    case 'if':
    case 'else if':
      if (argIndex === 0) options.push(...variableOptions(register, localVars));
      else if (argIndex >= 1) {
        options.push(...fixedOptions(OPERATOR_OPTIONS, 'operator', '运算符'));
        options.push(...fixedOptions(BOOLEAN_OPTIONS, 'bool', '布尔'));
      }
      break;

    case 'signal':
      if (argIndex === 0) options.push(...signalOptions(register));
      break;

    case 'timeout':
      if (argIndex === 0) options.push(...fixedOptions(['5', '8', '10', '15'], 'number', '秒数'));
      break;

    default:
      break;
  }

  return options.filter((opt) => opt.label.startsWith(ctx.current));
}
