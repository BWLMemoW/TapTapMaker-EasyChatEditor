// CodeMirror 6 编辑器装配：高亮、补全、诊断、快捷键

import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from '@codemirror/commands';
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
  acceptCompletion
} from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { linter, lintGutter } from '@codemirror/lint';
import { bracketMatching, indentOnInput, indentService, indentUnit } from '@codemirror/language';
import { ecHighlighter } from './dsl/highlighter.js';
import { getCompletionCandidates } from './dsl/completion.js';
import { analyzeScript } from './dsl/diagnostics.js';
import { parseLabelLine } from './dsl/tokenizer.js';

export function collectLabels(text) {
  const labels = [];
  for (const line of text.split('\n')) {
    const parsed = parseLabelLine(line);
    if (parsed && parsed.type === 'define' && parsed.label) labels.push(parsed.label);
  }
  return labels;
}

export function collectLocalVariables(text) {
  const vars = new Set();
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*@set\s+([\p{L}\p{N}_]+)/u);
    if (m) vars.add(m[1]);
  }
  return [...vars];
}

const EC_INDENT_UNIT = '    ';
const ecIndentUnit = indentUnit.of(EC_INDENT_UNIT);

function lineIndent(text) {
  const m = text.match(/^\s*/);
  return m ? m[0] : '';
}

function isIfOpener(text) {
  return /^@if(?:\s|$)/.test(text.trim());
}

function isChoiceOpener(text) {
  return /^@choice(?:\s|$)/.test(text.trim());
}

function isBlockOpener(text) {
  return isIfOpener(text) || isChoiceOpener(text);
}

function isIfCloser(text) {
  return /^@endif(?:\s|$)/.test(text.trim());
}

function isChoiceCloser(text) {
  return /^@end(?:\s|$)/.test(text.trim());
}

function isElseLine(text) {
  return /^@else(?:\s|$)/.test(text.trim());
}

function hasFollowingCloser(state, lineNo, closer) {
  for (let i = lineNo + 1; i <= state.doc.lines; i++) {
    const text = state.doc.line(i).text;
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    return trimmed === closer;
  }
  return false;
}

/**
 * 根据 EC 块结构计算某行期望的缩进列数。
 * @param {import('@codemirror/state').EditorState} docState
 * @param {number} lineNo 1-based
 */
export function desiredIndentForLine(docState, lineNo) {
  const unit = EC_INDENT_UNIT.length;
  const stack = []; // {type:'if'|'choice', indent:number}

  for (let i = 1; i < lineNo; i++) {
    const text = docState.doc.line(i).text;
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = lineIndent(text).length;

    if (isIfOpener(text)) {
      stack.push({ type: 'if', indent });
    } else if (isChoiceOpener(text)) {
      stack.push({ type: 'choice', indent });
    } else if (isIfCloser(text)) {
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j].type === 'if') {
          stack.splice(j, 1);
          break;
        }
      }
    } else if (isChoiceCloser(text)) {
      if (stack.length && stack[stack.length - 1].type === 'choice') {
        stack.pop();
      }
    }
  }

  const current = docState.doc.line(lineNo).text.trim();

  if (isIfCloser(current)) {
    for (let j = stack.length - 1; j >= 0; j--) {
      if (stack[j].type === 'if') return stack[j].indent;
    }
    return 0;
  }

  if (isElseLine(current)) {
    for (let j = stack.length - 1; j >= 0; j--) {
      if (stack[j].type === 'if') return stack[j].indent;
    }
    return 0;
  }

  if (isChoiceCloser(current)) {
    if (stack.length && stack[stack.length - 1].type === 'choice') {
      return stack[stack.length - 1].indent;
    }
    return 0;
  }

  if (stack.length) {
    return stack[stack.length - 1].indent + unit;
  }

  return 0;
}

function ecIndentService(context, pos) {
  const line = context.state.doc.lineAt(pos);
  return desiredIndentForLine(context.state, line.number);
}

/**
 * 输入 @if/@choice 后按 Enter：自动缩进一行，并在下一行补上 @endif/@end。
 */
function smartEnter(view) {
  const { state } = view;
  const { from, to } = state.selection.main;
  if (from !== to) return false;
  const line = state.doc.lineAt(from);
  if (from < line.to) return false; // 只在行尾触发
  const text = line.text;
  const trimmed = text.trim();
  const unit = EC_INDENT_UNIT.length;
  const baseIndent = desiredIndentForLine(state, line.number);
  const bodyIndent = ' '.repeat(baseIndent + unit);
  const closeIndent = ' '.repeat(baseIndent);

  if (isIfOpener(text)) {
    const hasCloser = hasFollowingCloser(state, line.number, '@endif');
    const insert = hasCloser
      ? `\n${bodyIndent}`
      : `\n${bodyIndent}\n${closeIndent}@endif`;
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: from + 1 + bodyIndent.length },
      scrollIntoView: true
    });
    return true;
  }

  if (isChoiceOpener(text)) {
    const hasCloser = hasFollowingCloser(state, line.number, '@end');
    const insert = hasCloser
      ? `\n${bodyIndent}`
      : `\n${bodyIndent}\n${closeIndent}@end`;
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: from + 1 + bodyIndent.length },
      scrollIntoView: true
    });
    return true;
  }

  // @else / @else if 后按 Enter：下一行正文保持一级缩进
  if (isElseLine(text)) {
    const insert = `\n${bodyIndent}`;
    view.dispatch({
      changes: { from, insert },
      selection: { anchor: from + 1 + bodyIndent.length },
      scrollIntoView: true
    });
    return true;
  }

  return false;
}

/**
 * 当用户在当前行输入 @else / @else if / @endif / @end 时，
 * 自动把该行缩进调整到与对应块起始位置对齐。
 */
function reindentStructuralLine(view) {
  const { state } = view;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const trimmed = line.text.trim();
  const isStructural = /^@(else(?:\s|$)|endif(?:\s|$)|end(?:\s|$))/.test(trimmed);
  if (!isStructural) return;

  const desired = desiredIndentForLine(state, line.number);
  const currentIndent = lineIndent(line.text).length;
  if (currentIndent === desired) return;

  const from = line.from;
  const to = line.from + currentIndent;
  const insert = ' '.repeat(desired);
  const anchor = Math.max(from, head - currentIndent + desired);
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor },
    scrollIntoView: false
  });
}

const darkEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--code-bg)',
    color: 'var(--text)',
    fontSize: 'var(--editor-font-size, 14px)'
  },
  '.cm-content': {
    caretColor: '#e8e8e8',
    fontSize: 'var(--editor-font-size, 14px)'
  },
  '.cm-gutter': {
    fontSize: 'var(--editor-font-size, 14px)'
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: '#e8e8e8'
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-panel)',
    color: 'var(--text-dim)',
    borderRight: '1px solid var(--border)'
  }
}, { dark: true });

/**
 * 创建编辑器状态。
 * @param {string} doc
 * @param {{current: object}} registerRef 持有 parseRegister 结果的对象引用
 * @param {(update: import('@codemirror/view').ViewUpdate) => void} onUpdate
 */
export function createEditorState(doc, registerRef, onUpdate) {
  const ecLinter = linter((view) => {
    const text = view.state.doc.toString();
    const diagnostics = analyzeScript(text, registerRef.current);
    return diagnostics.map((d) => ({
      from: d.from,
      to: d.to,
      severity: d.severity,
      message: d.message
    }));
  }, { delay: 300 });

  const ecCompletion = autocompletion({
    override: [
      (context) => {
        const line = context.state.doc.lineAt(context.pos);
        const candidates = getCompletionCandidates(
          line.text,
          context.pos - line.from,
          registerRef.current,
          collectLabels(context.state.doc.toString()),
          collectLocalVariables(context.state.doc.toString())
        );
        if (!candidates) return null;
        return {
          from: line.from + candidates.from,
          options: candidates.options,
          filter: false
        };
      }
    ],
    activateOnTyping: true,
    maxRenderedOptions: 200
  });

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const view = update.view;
      // 延迟到当前更新结束后再调整缩进，避免在 update 回调里嵌套 dispatch
      setTimeout(() => {
        try {
          reindentStructuralLine(view);
        } catch {
          // 忽略调整失败，不影响正常输入
        }
      }, 0);
    }
    if (onUpdate) onUpdate(update);
  });

  return EditorState.create({
    doc,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      ecIndentUnit,
      indentService.of(ecIndentService),
      bracketMatching(),
      closeBrackets(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        { key: 'Enter', run: smartEnter },
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...completionKeymap,
        { key: 'Tab', run: acceptCompletion },
        indentWithTab
      ]),
      darkEditorTheme,
      ecHighlighter,
      lintGutter(),
      ecLinter,
      ecCompletion,
      updateListener
    ]
  });
}

export function createEditorView(parent, state) {
  return new EditorView({ state, parent });
}

export function insertAtCursor(view, text) {
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    scrollIntoView: true
  });
  view.focus();
}
