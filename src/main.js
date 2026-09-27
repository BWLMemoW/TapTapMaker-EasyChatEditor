// Easy-ChatBox DSL 编辑器入口

import './styles.css';
import { createEditorState, createEditorView, insertAtCursor } from './editor.js';
import { undo, redo } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import { analyzeScript, countErrors, countWarnings } from './dsl/diagnostics.js';
import { analyzeStoryStats, estimatePlayTimeMinutes, formatPlayTime, DEFAULT_CHARS_PER_MINUTE } from './dsl/stats.js';
import { parseRegister, loadDefaultRegister, formatRegisterStatus } from './register.js';
import { createResourcePanel } from './resourcePanel.js';
import { openFileWithDialog, saveFileWithDialog, readFileAsText, saveRegisterHandle, loadRegisterHandle, pickRegisterHandle, requestHandlePermission, readHandleFile, saveFileToPath, readFileFromPath, writeToHandle, fetchWithTimeout } from './fileSystem.js';

const REGISTER_STORAGE_KEY = 'easy-chat-editor.register';
const FONT_STORAGE_KEY = 'easy-chat-editor.font-size';
const EDITOR_FONT_BASE = 14;
const EDITOR_FONT_MIN = 10;
const EDITOR_FONT_MAX = 28;

function saveRegisterToStorage(name, text) {
  try {
    localStorage.setItem(REGISTER_STORAGE_KEY, JSON.stringify({ name, text }));
  } catch {
    // 忽略隐私模式/存储不可用
  }
}

function loadRegisterFromStorage() {
  try {
    const raw = localStorage.getItem(REGISTER_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.text !== 'string') return null;
    const register = parseRegister(data.text);
    if (!register.ok) return null;
    register.sourceName = data.name || '自定义 register.json';
    return register;
  } catch {
    return null;
  }
}

async function loadRegisterFromServer() {
  try {
    const response = await fetchWithTimeout('/__ec_settings', { cache: 'no-cache' }, 3000);
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.register && typeof data.register.text === 'string') {
      const register = parseRegister(data.register.text);
      if (!register.ok) return null;
      register.sourceName = data.register.name || '自定义 register.json';
      register.sourcePath = data.register.path || null;
      return register;
    }
  } catch {
    // 开发模式或没有本地设置接口时忽略
  }
  return null;
}

async function saveRegisterToServer(name, text, path = null) {
  try {
    await fetchWithTimeout('/__ec_settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ register: { name, text, path } })
    }, 3000);
  } catch {
    // 开发模式或没有本地设置接口时忽略
  }
}

async function pickRegisterNative() {
  try {
    // 原生选择对话框同样可能让用户选很久，超时给 5 分钟，避免重复弹窗
    const response = await fetchWithTimeout('/__ec_open_register', { method: 'POST' }, 300000);
    if (!response.ok) return null;
    const data = await response.json();
    if (data && typeof data.text === 'string') return data;
  } catch {
    // 开发模式没有原生选择接口
  }
  return null;
}

async function reloadRegisterFromServer() {
  try {
    const response = await fetchWithTimeout('/__ec_reload_register', { method: 'POST' }, 5000);
    if (!response.ok) return null;
    const data = await response.json();
    if (data && typeof data.text === 'string') {
      const register = parseRegister(data.text);
      if (register.ok) {
        register.sourceName = data.name || '自定义 register.json';
        register.sourcePath = data.path || null;
        return register;
      }
    }
  } catch {
    // 开发模式没有原生重载接口
  }
  return null;
}

async function applyRegisterData(name, text, path = null, handle = null) {
  const register = parseRegister(text);
  if (register.ok) {
    saveRegisterToStorage(name, text);
    await saveRegisterToServer(name, text, path);
    if (handle) {
      try {
        await saveRegisterHandle(handle);
        register.sourceHandle = handle;
      } catch {
        // 无法保存句柄时忽略
      }
    }
    register.sourceName = name;
    register.sourcePath = path;
  }
  await setRegister(register);
  if (!register.ok) {
    window.alert(`register.json 解析失败：${register.error}`);
  }
  return register;
}

/**
 * 图形化注册编辑器保存：把编辑得到的 JSON 文本重新解析为注册索引并应用。
 * 保留当前 sourceName/sourcePath/sourceHandle；若用户有可写文件句柄则写回磁盘。
 */
async function applyRegisterFromEditor(jsonText) {
  try {
    const parsed = parseRegister(jsonText);
    if (!parsed.ok) {
      window.alert(`注册表内容有误，未应用：${parsed.error}`);
      return;
    }

    // 沿用当前已加载注册表来源信息
    parsed.sourceName = state.register.sourceName || 'register.json';
    parsed.sourcePath = state.register.sourcePath || null;
    parsed.sourceHandle = state.register.sourceHandle || null;

    // 保存到本地缓存 + exe 后端
    saveRegisterToStorage(parsed.sourceName, jsonText);
    await saveRegisterToServer(parsed.sourceName, jsonText, parsed.sourcePath);

    // 有可写文件句柄则尽量写回磁盘
    if (parsed.sourceHandle) {
      try {
        await writeToHandle(parsed.sourceHandle, jsonText);
      } catch {
        // 句柄失效时不阻塞，仍保留内存中的新注册表
      }
    }

    await setRegister(parsed);
    flashStatus(`注册表已保存（${parsed.sourceName}）`);
  } catch (err) {
    console.error(err);
    flashStatus(`保存注册表失败：${err?.message || err}`);
  }
}

async function loadRegisterFromHandle() {
  try {
    const handle = await loadRegisterHandle();
    if (!handle) return null;
    if (!(await requestHandlePermission(handle))) return null;
    const text = await readHandleFile(handle);
    const register = parseRegister(text);
    if (!register.ok) return null;
    register.sourceName = handle.name || '自定义 register.json';
    register.sourcePath = null;
    register.sourceHandle = handle;
    return register;
  } catch {
    return null;
  }
}

async function pickRegisterBest() {
  setToolbarBusy(true);
  try {
    // 1) exe 原生选择（能拿到完整路径，刷新时可直接读磁盘）
    const native = await pickRegisterNative();
    if (native && typeof native.text === 'string') {
      await applyRegisterData(native.name, native.text, native.path || null);
      flashStatus(`已选择注册文件 ${native.name}`);
      return;
    }

    // 2) File System Access API（能保存句柄，刷新时直接读磁盘）
    try {
      const handle = await pickRegisterHandle();
      if (handle) {
        const text = await readHandleFile(handle);
        await applyRegisterData(handle.name, text, null, handle);
        flashStatus(`已选择注册文件 ${handle.name}`);
        return;
      }
    } catch (err) {
      // 用户取消选择：不继续弹窗
      if (err && err.name === 'AbortError') {
        flashStatus('已取消选择注册文件');
        return;
      }
      // 浏览器不支持 File System Access API 时降级到普通 file input
    }

    if (!window.showOpenFilePicker) {
      dom.registerFileInput.click();
    }
  } catch (err) {
    console.error(err);
    flashStatus(`选择注册文件失败：${err?.message || err}`);
  } finally {
    setToolbarBusy(false);
  }
}

function createEmptyRegister() {
  return {
    ok: false,
    data: null,
    error: '未加载 register.json',
    characters: new Map(),
    scenes: new Map(),
    audios: new Map(),
    decorations: new Map(),
    variables: new Map(),
    flags: new Set(),
    customButtons: [],
    ui_elements: {}
  };
}

const state = {
  tabs: [],
  activeTabId: null,
  register: createEmptyRegister(),
  registerRef: { current: null },
  view: null,
  resourcePanel: null,
  lastDiagnostics: [],
  storyStats: { dialogues: 0, narrations: 0, choices: 0, total: 0, lines: 0 }
};

let diagnosticsTimer = null;
let statusMessage = null;
let statusMessageTimer = null;

function flashStatus(message) {
  statusMessage = message;
  if (dom) dom.statusFile.textContent = message;
  clearTimeout(statusMessageTimer);
  statusMessageTimer = setTimeout(() => {
    statusMessage = null;
    updateStatusBar();
  }, 3000);
}

function renderStoryStatus() {
  if (!dom) return;
  // 有编辑器视图时实时统计，保证切换标签/输入后立刻准确；否则用诊断里已算出的值
  if (state.view) {
    state.storyStats = analyzeStoryStats(state.view.state.doc.toString());
  }
  const s = state.storyStats || { dialogues: 0, narrations: 0, choices: 0, total: 0 };
  const minutes = estimatePlayTimeMinutes(s.total, DEFAULT_CHARS_PER_MINUTE);
  dom.statusStory.textContent = `剧情 ${s.total} 字 · ${formatPlayTime(minutes)}`;
  dom.statusStory.title = `对话 ${s.dialogues} 字 · 旁白 ${s.narrations} 字 · 选项 ${s.choices} 字`
    + `\n预计游玩时长按 ${DEFAULT_CHARS_PER_MINUTE} 字/分钟估算`;
}

function setToolbarBusy(busy) {
  if (!dom) return;
  const buttons = [
    dom.btnNew, dom.btnOpen, dom.btnSave, dom.btnSaveAs,
    dom.btnUndo, dom.btnRedo, dom.btnFind, dom.btnReloadCurrent,
    dom.btnReloadRegister, dom.btnPickRegister
  ];
  for (const btn of buttons) {
    if (btn) btn.disabled = busy;
  }
}

function currentTab() {
  return state.tabs.find((t) => t.id === state.activeTabId) || null;
}

function getDom() {
  return {
    editorHost: document.getElementById('editor-host'),
    tabBar: document.getElementById('tab-bar'),
    resourcePanel: document.getElementById('resource-panel'),
    diagnosticList: document.getElementById('diagnostic-list'),
    statusFile: document.getElementById('status-file'),
    statusPos: document.getElementById('status-pos'),
    statusRegister: document.getElementById('status-register'),
    statusStory: document.getElementById('status-story'),
    statusErrors: document.getElementById('status-errors'),
    registerStatus: document.getElementById('register-status'),
    btnNew: document.getElementById('btn-new'),
    btnOpen: document.getElementById('btn-open'),
    btnSave: document.getElementById('btn-save'),
    btnSaveAs: document.getElementById('btn-save-as'),
    btnUndo: document.getElementById('btn-undo'),
    btnRedo: document.getElementById('btn-redo'),
    btnFind: document.getElementById('btn-find'),
    btnReloadCurrent: document.getElementById('btn-reload-current'),
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnZoomReset: document.getElementById('btn-zoom-reset'),
    zoomLevel: document.getElementById('zoom-level'),
    btnReloadRegister: document.getElementById('btn-reload-register'),
    btnPickRegister: document.getElementById('btn-pick-register'),
    registerFileInput: document.getElementById('register-file-input')
  };
}

let dom = null;

let fontSizePx = null;

function loadFontSize() {
  try {
    const raw = localStorage.getItem(FONT_STORAGE_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n)) {
        fontSizePx = Math.min(EDITOR_FONT_MAX, Math.max(EDITOR_FONT_MIN, n));
        return fontSizePx;
      }
    }
  } catch {
    // 隐私模式 / 存储不可用时忽略
  }
  fontSizePx = EDITOR_FONT_BASE;
  return fontSizePx;
}

function setFontSize(px) {
  const clamped = Math.min(EDITOR_FONT_MAX, Math.max(EDITOR_FONT_MIN, Math.round(px)));
  fontSizePx = clamped;
  const app = document.getElementById('app');
  if (app) {
    app.style.setProperty('--editor-font-size', `${clamped}px`);
  }
  if (dom && dom.zoomLevel) {
    const percent = Math.round((clamped / EDITOR_FONT_BASE) * 100);
    dom.zoomLevel.textContent = `${percent}%`;
    dom.zoomLevel.title = `当前字号 ${clamped}px`;
  }
  try {
    localStorage.setItem(FONT_STORAGE_KEY, String(clamped));
  } catch {
    // 隐私模式 / 存储不可用时忽略
  }
}

function zoomFont(delta) {
  setFontSize((fontSizePx == null ? EDITOR_FONT_BASE : fontSizePx) + delta);
}

function renderTabs() {
  dom.tabBar.textContent = '';
  for (const tab of state.tabs) {
    const el = document.createElement('div');
    el.className = 'tab' + (tab.id === state.activeTabId ? ' active' : '') + (tab.dirty ? ' dirty' : '');
    el.textContent = tab.name;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tab-close';
    close.textContent = '×';
    close.title = '关闭';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    el.appendChild(close);
    el.addEventListener('click', () => switchTab(tab.id));
    dom.tabBar.appendChild(el);
  }
}

function addTab(name, content, handle = null, activate = true) {
  const tab = {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    content,
    handle,
    path: null,
    dirty: false
  };
  state.tabs.push(tab);
  if (activate || !state.activeTabId) {
    switchTab(tab.id);
  } else {
    renderTabs();
  }
  return tab;
}

function switchTab(id) {
  if (state.activeTabId === id) return;
  clearTimeout(diagnosticsTimer);
  diagnosticsTimer = null;
  if (state.view) {
    const tab = currentTab();
    if (tab) tab.content = state.view.state.doc.toString();
    state.view.destroy();
    state.view = null;
  }
  state.activeTabId = id;
  const tab = currentTab();
  if (!tab) return;
  const editorState = createEditorState(tab.content, state.registerRef, handleEditorUpdate);
  state.view = createEditorView(dom.editorHost, editorState);
  state.view.focus();
  renderTabs();
  updateStatusBar();
  // 先让编辑器立刻显示出来，诊断放到下一帧再算，避免打开大文件时卡在“全量诊断”上
  setTimeout(() => {
    if (currentTab()?.id === id) refreshDiagnostics();
  }, 30);
}

function closeTab(id) {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return;
  const tab = state.tabs[idx];
  if (tab.dirty && !window.confirm(`“${tab.name}” 有未保存的修改，确定关闭吗？`)) return;

  if (state.activeTabId === id) {
    clearTimeout(diagnosticsTimer);
    diagnosticsTimer = null;
    if (state.view) {
      tab.content = state.view.state.doc.toString();
      state.view.destroy();
      state.view = null;
    }
    state.tabs.splice(idx, 1);
    state.activeTabId = null;
    if (state.tabs.length) {
      const next = state.tabs[Math.max(0, idx - 1)];
      switchTab(next.id);
    } else {
      renderTabs();
      updateStatusBar();
      refreshDiagnostics();
    }
  } else {
    state.tabs.splice(idx, 1);
    renderTabs();
  }
}

async function newFile() {
  addTab('未命名.txt', '');
}

async function openFile() {
  setToolbarBusy(true);
  try {
    const file = await openFileWithDialog();
    if (!file) {
      flashStatus('已取消打开文件');
      return;
    }
    addTab(file.name, file.text, file.handle);
    flashStatus(`已打开 ${file.name}`);
  } catch (err) {
    console.error(err);
    flashStatus(`打开文件失败：${err?.message || err}`);
  } finally {
    setToolbarBusy(false);
  }
}

async function saveCurrent(asNew = false) {
  const tab = currentTab();
  if (!tab || !state.view) {
    flashStatus('没有可保存的文件');
    return;
  }
  const content = state.view.state.doc.toString();

  setToolbarBusy(true);
  try {
    // 保存（非另存为）：如果有已保存的路径/句柄，直接写回，不再弹窗
    if (!asNew) {
      if (tab.path) {
        const ok = await saveFileToPath(tab.path, content);
        if (ok) {
          tab.content = content;
          tab.dirty = false;
          renderTabs();
          updateStatusBar();
          flashStatus('已保存');
          return;
        }
        // 路径写失败（文件被占用/移动/删除）时不要静默返回，继续走另存为
        flashStatus(`无法写入 ${tab.path}，请另存为…`);
      }
      if (tab.handle) {
        try {
          await writeToHandle(tab.handle, content);
          tab.content = content;
          tab.dirty = false;
          renderTabs();
          updateStatusBar();
          flashStatus('已保存');
          return;
        } catch {
          // 句柄失效时继续走保存对话框
        }
      }
    }

    // 另存为 / 首次保存 / 句柄失效：弹对话框
    const result = await saveFileWithDialog(asNew ? null : tab.handle, tab.name, content);
    if (result && result.ok) {
      if (result.handle) tab.handle = result.handle;
      if (result.path) tab.path = result.path;
      if (result.name) tab.name = result.name;
      tab.content = content;
      tab.dirty = false;
      renderTabs();
      updateStatusBar();
      flashStatus(result.downloaded ? '已下载文件（浏览器降级模式）' : `已保存为 ${tab.name}`);
    } else {
      flashStatus('已取消保存');
    }
  } catch (err) {
    console.error(err);
    flashStatus(`保存失败：${err?.message || err}`);
  } finally {
    setToolbarBusy(false);
  }
}

async function reloadCurrentFile() {
  const tab = currentTab();
  if (!tab || !state.view) {
    flashStatus('没有可重新加载的文件');
    return;
  }

  // 需要有关联的本地文件来源（句柄或路径）
  if (!tab.handle && !tab.path) {
    flashStatus('当前文件没有关联本地路径，无法重新加载');
    return;
  }

  // 有未保存修改时先确认，避免误丢
  if (tab.dirty && !window.confirm(`“${tab.name}” 有未保存的修改，重新加载将丢弃这些修改，确定吗？`)) {
    flashStatus('已取消重新加载');
    return;
  }

  setToolbarBusy(true);
  try {
    let text = null;
    if (tab.handle) {
      // 文件句柄：先确保读权限，再读取
      try {
        if (!(await requestHandlePermission(tab.handle))) {
          flashStatus('无法访问该文件（权限被拒绝）');
          return;
        }
        text = await readHandleFile(tab.handle);
      } catch (err) {
        text = null;
      }
    } else if (tab.path) {
      text = await readFileFromPath(tab.path);
    }

    if (text === null) {
      flashStatus(`无法从本地读取 ${tab.name}（文件可能被移动、删除或无权限）`);
      return;
    }

    // 替换编辑器全文
    const { from, to } = { from: 0, to: state.view.state.doc.length };
    state.view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: 0 },
      scrollIntoView: true
    });
    tab.content = text;
    tab.dirty = false;
    renderTabs();
    refreshDiagnostics();
    updateStatusBar();
    flashStatus(`已从本地重新加载 ${tab.name}`);
  } catch (err) {
    console.error(err);
    flashStatus(`重新加载失败：${err?.message || err}`);
  } finally {
    setToolbarBusy(false);
  }
}

function handleEditorUpdate(update) {
  const tab = currentTab();
  if (!tab) return;
  if (update.docChanged) {
    tab.content = update.state.doc.toString();
    tab.dirty = true;
    renderTabs();
    clearTimeout(diagnosticsTimer);
    diagnosticsTimer = setTimeout(() => {
      diagnosticsTimer = null;
      refreshDiagnostics();
    }, 200);
  }
  updateStatusBar();
}

function updateStatusBar() {
  if (!dom) return;
  renderStoryStatus();
  if (statusMessage) {
    dom.statusFile.textContent = statusMessage;
    dom.statusPos.textContent = '';
    dom.statusRegister.textContent = formatRegisterStatus(state.register);
    const errors = countErrors(state.lastDiagnostics);
    const warnings = countWarnings(state.lastDiagnostics);
    dom.statusErrors.textContent = `错误 ${errors} · 警告 ${warnings}`;
    dom.registerStatus.textContent = state.register.ok
      ? `register.json：已加载${state.register.sourceName ? `（${state.register.sourceName}）` : `（${state.register.characters.size} 角色）`}`
      : 'register.json：未找到或加载失败';
    return;
  }
  if (!state.view) {
    dom.statusFile.textContent = '无文件';
    dom.statusPos.textContent = '';
    dom.statusRegister.textContent = formatRegisterStatus(state.register);
    dom.statusErrors.textContent = '错误 0 · 警告 0';
    dom.registerStatus.textContent = state.register.ok
      ? `register.json：已加载${state.register.sourceName ? `（${state.register.sourceName}）` : `（${state.register.characters.size} 角色）`}`
      : 'register.json：未找到或加载失败';
    return;
  }
  const tab = currentTab();
  const doc = state.view.state.doc;
  const sel = state.view.state.selection.main;
  const line = doc.lineAt(sel.head);
  const col = sel.head - line.from + 1;
  dom.statusFile.textContent = tab ? (tab.name + (tab.dirty ? ' *' : '')) : '无文件';
  dom.statusPos.textContent = `行 ${line.number}，列 ${col}`;
  dom.statusRegister.textContent = formatRegisterStatus(state.register);
  const errors = countErrors(state.lastDiagnostics);
  const warnings = countWarnings(state.lastDiagnostics);
  dom.statusErrors.textContent = `错误 ${errors} · 警告 ${warnings}`;
  dom.registerStatus.textContent = state.register.ok
    ? `register.json：已加载${state.register.sourceName ? `（${state.register.sourceName}）` : `（${state.register.characters.size} 角色）`}`
    : 'register.json：未找到或加载失败';
}

function refreshDiagnostics() {
  if (!state.view || !dom) return;
  const text = state.view.state.doc.toString();
  state.lastDiagnostics = analyzeScript(text, state.registerRef.current);
  state.storyStats = analyzeStoryStats(text);
  renderDiagnostics();
  updateStatusBar();
}

const MAX_RENDERED_DIAGNOSTICS = 300;

function renderDiagnostics() {
  dom.diagnosticList.textContent = '';
  if (!state.lastDiagnostics.length) {
    const empty = document.createElement('div');
    empty.className = 'resource-empty';
    empty.textContent = '暂无诊断';
    dom.diagnosticList.appendChild(empty);
    return;
  }

  const shown = state.lastDiagnostics.slice(0, MAX_RENDERED_DIAGNOSTICS);
  for (const diag of shown) {
    const item = document.createElement('div');
    item.className = `diagnostic-item ${diag.severity}`;

    const sev = document.createElement('span');
    sev.className = 'diag-sev';
    sev.textContent = diag.severity === 'error' ? '错误' : '警告';

    const msg = document.createElement('span');
    msg.className = 'diag-msg';
    msg.textContent = diag.message;

    const line = document.createElement('span');
    line.className = 'diag-line';
    const doc = state.view.state.doc;
    const lineNo = doc.lineAt(Math.min(diag.from, doc.length)).number;
    line.textContent = `第 ${lineNo} 行`;

    item.append(sev, msg, line);
    item.addEventListener('click', () => {
      const pos = Math.min(diag.from, state.view.state.doc.length);
      state.view.dispatch({
        selection: { anchor: pos },
        scrollIntoView: true
      });
      state.view.focus();
    });
    dom.diagnosticList.appendChild(item);
  }

  if (state.lastDiagnostics.length > shown.length) {
    const more = document.createElement('div');
    more.className = 'resource-empty';
    more.textContent = `… 还有 ${state.lastDiagnostics.length - shown.length} 条诊断未显示`;
    dom.diagnosticList.appendChild(more);
  }
}

function insertResource(id) {
  if (state.view) {
    insertAtCursor(state.view, id);
  } else {
    navigator.clipboard?.writeText(id);
  }
}

async function setRegister(register) {
  state.register = register;
  state.registerRef.current = register;
  if (state.resourcePanel) state.resourcePanel.setRegister(register);
  refreshDiagnostics();
}

async function reloadRegister() {
  try {
    // 1) 有可持久化文件句柄时，直接从磁盘重新读取
    const fromHandle = await loadRegisterFromHandle();
    if (fromHandle) {
      await setRegister(fromHandle);
      flashStatus('register.json 已从文件句柄刷新');
      return;
    }

    // 2) exe 保存了完整路径时，从磁盘重新读取
    const fresh = await reloadRegisterFromServer();
    if (fresh) {
      await setRegister(fresh);
      flashStatus('register.json 已从磁盘刷新');
      return;
    }

    // 3) 回退到已存内容/默认路径
    const stored = await loadRegisterFromServer() || loadRegisterFromStorage();
    const register = stored || await loadDefaultRegister();
    await setRegister(register);
    flashStatus(register.ok ? 'register.json 已加载' : 'register.json 加载失败，已进入降级模式');
  } catch (err) {
    console.error(err);
    flashStatus(`刷新注册表失败：${err?.message || err}`);
  }
}

async function loadRegisterFile(file, path = null) {
  const text = await readFileAsText(file);
  await applyRegisterData(file.name, text, path);
}

function bindEvents() {
  dom.btnNew.addEventListener('click', newFile);
  dom.btnOpen.addEventListener('click', openFile);
  dom.btnSave.addEventListener('click', () => saveCurrent(false));
  dom.btnSaveAs.addEventListener('click', () => saveCurrent(true));
  dom.btnUndo.addEventListener('click', () => { if (state.view) undo(state.view); });
  dom.btnRedo.addEventListener('click', () => { if (state.view) redo(state.view); });
  dom.btnFind.addEventListener('click', () => {
    if (state.view) openSearchPanel(state.view);
  });
  dom.btnReloadCurrent.addEventListener('click', reloadCurrentFile);
  dom.btnZoomIn.addEventListener('click', () => zoomFont(1));
  dom.btnZoomOut.addEventListener('click', () => zoomFont(-1));
  dom.btnZoomReset.addEventListener('click', () => setFontSize(EDITOR_FONT_BASE));
  dom.btnReloadRegister.addEventListener('click', reloadRegister);
  dom.btnPickRegister.addEventListener('click', async () => {
    await pickRegisterBest();
  });
  dom.registerFileInput.addEventListener('change', async () => {
    const file = dom.registerFileInput.files?.[0];
    if (file) await loadRegisterFile(file);
    dom.registerFileInput.value = '';
  });

  // 全局字号缩放快捷键：Ctrl+= / Ctrl+- / Ctrl+0
  window.addEventListener('keydown', (e) => {
    // Ctrl+Alt+R：从本地重新加载当前文件
    if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      reloadCurrentFile();
      return;
    }
    if (!e.ctrlKey && !e.metaKey) return;
    const key = e.key.toLowerCase();
    if (key === '=' || key === '+') {
      e.preventDefault();
      zoomFont(1);
    } else if (key === '-' || key === '_') {
      e.preventDefault();
      zoomFont(-1);
    } else if (key === '0') {
      e.preventDefault();
      setFontSize(EDITOR_FONT_BASE);
    }
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.tabs.some((t) => t.dirty)) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

async function init() {
  dom = getDom();
  state.registerRef.current = state.register;

  // 恢复上次的编辑器字号
  loadFontSize();
  setFontSize(fontSizePx);

  // 先绑定按钮并创建默认空文件，避免注册表加载/句柄权限等异步操作卡住时整个界面“没反应”
  bindEvents();
  state.resourcePanel = createResourcePanel(dom.resourcePanel, state.register, insertResource, {
    onSaveRegister: (jsonText) => applyRegisterFromEditor(jsonText)
  });
  addTab('未命名.txt', '');

  // 优先使用用户手动指定过的注册文件：文件句柄 > exe 本地设置 > localStorage > 默认路径
  const stored = await loadRegisterFromHandle()
    || await loadRegisterFromServer()
    || loadRegisterFromStorage();
  const register = stored || await loadDefaultRegister();
  await setRegister(register);

  // 开启时自动刷新一次注册表，确保读到磁盘/本地最新内容
  await reloadRegister();
}

init();
