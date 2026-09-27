// CodeMirror 6 自定义语法高亮插件
// 基于 tokenizeLine 的纯词法结果，为可见行生成 Decoration。

import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, ViewPlugin } from '@codemirror/view';
import { tokenizeLine } from './tokenizer.js';

const markCache = {};

function markFor(type) {
  if (!markCache[type]) {
    markCache[type] = Decoration.mark({ class: `cm-ec-token cm-ec-${type}` });
  }
  return markCache[type];
}

function buildDecorations(view) {
  const builder = new RangeSetBuilder();
  const { doc } = view.state;
  const seen = new Set();

  for (const range of view.visibleRanges) {
    const fromLine = doc.lineAt(range.from);
    const toLine = doc.lineAt(range.to);

    for (let lineNo = fromLine.number; lineNo <= toLine.number; lineNo++) {
      if (seen.has(lineNo)) continue;
      seen.add(lineNo);

      const line = doc.line(lineNo);
      const tokens = tokenizeLine(line.text);
      for (const token of tokens) {
        if (!token.type) continue;
        const from = line.from + token.from;
        const to = line.from + token.to;
        builder.add(from, to, markFor(token.type));
      }
    }
  }

  return builder.finish();
}

export const ecHighlighter = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
);

// 自定义 CSS 类。CodeMirror 会用 Decoration.mark 的 class 包裹每个 token，
// 我们额外在 mark 上放 token.type 作为属性，再通过 CSS 选择器上色。
