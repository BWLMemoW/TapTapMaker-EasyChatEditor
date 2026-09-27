// 左侧资源面板：展示 register.json 内容，点击插入 ID；支持切换图形化注册编辑器

import { createRegisterEditor } from './registerEditor.js';

/**
 * 创建左侧资源面板（浏览/编辑双视图）。
 * @param {HTMLElement} container
 * @param {object} register 由 parseRegister 返回的注册索引
 * @param {(id:string)=>void} onInsert 点击资源项时插入 ID 到编辑器
 * @param {{onSaveRegister?:(jsonText:string)=>void}} [options]
 */
export function createResourcePanel(container, register, onInsert, options = {}) {
  const root = document.createElement('div');
  root.className = 'resource-panel';

  const header = document.createElement('div');
  header.className = 'panel-header resource-panel-header';

  const headerTitle = document.createElement('span');
  headerTitle.className = 'resource-panel-title';
  headerTitle.textContent = '注册表';

  const viewTabs = document.createElement('div');
  viewTabs.className = 'view-tabs';
  const browseBtn = document.createElement('button');
  browseBtn.type = 'button';
  browseBtn.className = 'view-tab active';
  browseBtn.textContent = '浏览';
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'view-tab';
  editBtn.textContent = '编辑';
  viewTabs.append(browseBtn, editBtn);

  header.append(headerTitle, viewTabs);
  root.appendChild(header);

  const search = document.createElement('input');
  search.className = 'resource-search';
  search.type = 'search';
  search.placeholder = '搜索资源…';
  root.appendChild(search);

  const body = document.createElement('div');
  body.className = 'resource-body';
  root.appendChild(body);

  const editorHost = document.createElement('div');
  editorHost.className = 'resource-editor-host';
  editorHost.style.display = 'none';
  root.appendChild(editorHost);

  let currentRegister = register;
  let editor = null;
  let mode = 'browse';

  function showBrowse() {
    mode = 'browse';
    search.style.display = '';
    body.style.display = '';
    editorHost.style.display = 'none';
    browseBtn.classList.add('active');
    editBtn.classList.remove('active');
    render();
  }

  function showEdit() {
    mode = 'edit';
    search.style.display = 'none';
    body.style.display = 'none';
    editorHost.style.display = '';
    browseBtn.classList.remove('active');
    editBtn.classList.add('active');
    if (!editor) {
      editor = createRegisterEditor(editorHost, currentRegister, {
        onSave: (jsonText) => {
          if (options.onSaveRegister) options.onSaveRegister(jsonText);
        },
        onClose: () => showBrowse()
      });
    } else {
      editor.setRegister(currentRegister);
      editor.refresh();
    }
  }

  function render() {
    body.textContent = '';
    if (!currentRegister.ok) {
      const empty = document.createElement('div');
      empty.className = 'resource-empty';
      empty.textContent = '未加载 register.json';
      body.appendChild(empty);
      return;
    }

    const q = search.value.trim().toLowerCase();
    const matches = (s) => !q || String(s).toLowerCase().includes(q);

    const sections = [];

    const chars = [...currentRegister.characters.entries()].filter(([id]) => matches(id) || matches(currentRegister.characters.get(id)?.display_name || ''));
    if (chars.length) {
      const items = chars.map(([id, role]) => {
        const expressions = Object.keys(role.sprites || {});
        return {
          id,
          title: `${id} ${role.display_name || ''}`.trim(),
          detail: `表情 ${expressions.length} 个 · 默认位置 ${role.default_position || 'center'}`,
          type: '角色'
        };
      });
      sections.push({ title: `角色 (${items.length})`, items });
    }

    const scenes = [...currentRegister.scenes.entries()].filter(([id]) => matches(id));
    if (scenes.length) {
      sections.push({
        title: `场景 (${scenes.length})`,
        items: scenes.map(([id, scene]) => ({
          id,
          title: id,
          detail: scene.type === 'cg' ? 'CG · 解锁收集' : (scene.type || 'background'),
          type: '场景'
        }))
      });
    }

    const audios = [...currentRegister.audios.entries()].filter(([id]) => matches(id));
    if (audios.length) {
      sections.push({
        title: `音频 (${audios.length})`,
        items: audios.map(([id, audio]) => ({
          id,
          title: id,
          detail: `${audio.type || 'audio'} · 音量 ${audio.volume ?? 1}`,
          type: '音频'
        }))
      });
    }

    const decos = [...currentRegister.decorations.entries()].filter(([id]) => matches(id));
    if (decos.length) {
      sections.push({
        title: `装饰 (${decos.length})`,
        items: decos.map(([id, deco]) => ({
          id,
          title: id,
          detail: deco.description || '装饰',
          type: '装饰'
        }))
      });
    }

    const buttons = (currentRegister.customButtons || []).filter((btn) => matches(btn.id) || matches(btn.signal || '') || matches(btn.label || ''));
    if (buttons.length) {
      sections.push({
        title: `功能按钮 (${buttons.length})`,
        items: buttons.map((btn) => ({
          id: btn.signal,
          title: btn.label || btn.id,
          detail: `signal: ${btn.signal} · ${btn.style || 'default'}`,
          type: '按钮'
        }))
      });
    }

    const vars = [...currentRegister.variables.keys()].filter((name) => matches(name));
    const flags = [...currentRegister.flags].filter((name) => matches(name));
    if (vars.length || flags.length) {
      const items = [
        ...vars.map((name) => ({
          id: name,
          title: name,
          detail: `变量 = ${JSON.stringify(currentRegister.variables.get(name))}`,
          type: '变量'
        })),
        ...flags.map((name) => ({ id: name, title: name, detail: '开关（false）', type: '开关' }))
      ];
      sections.push({ title: `变量 / 开关 (${items.length})`, items });
    }

    if (!sections.length) {
      const empty = document.createElement('div');
      empty.className = 'resource-empty';
      empty.textContent = '没有匹配的资源';
      body.appendChild(empty);
      return;
    }

    for (const section of sections) {
      const secEl = document.createElement('section');
      secEl.className = 'resource-section';

      const secTitle = document.createElement('div');
      secTitle.className = 'resource-section-title';
      secTitle.textContent = section.title;
      secEl.appendChild(secTitle);

      const list = document.createElement('div');
      list.className = 'resource-list';
      for (const item of section.items) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'resource-item';
        row.title = item.detail;
        row.innerHTML = '';
        const name = document.createElement('span');
        name.className = 'resource-item-name';
        name.textContent = item.id;
        const detail = document.createElement('span');
        detail.className = 'resource-item-detail';
        detail.textContent = item.detail;
        row.append(name, detail);
        row.addEventListener('click', () => onInsert(item.id));
        list.appendChild(row);
      }
      secEl.appendChild(list);
      body.appendChild(secEl);
    }
  }

  search.addEventListener('input', render);
  browseBtn.addEventListener('click', showBrowse);
  editBtn.addEventListener('click', showEdit);
  render();

  container.appendChild(root);

  return {
    setRegister(register) {
      currentRegister = register;
      if (mode === 'edit') {
        if (editor) {
          editor.setRegister(register);
          editor.refresh();
        }
      } else {
        render();
      }
    },
    focusSearch() {
      if (mode === 'browse') search.focus();
    },
    openEditor() {
      showEdit();
    },
    closeEditor() {
      showBrowse();
    },
    getMode() {
      return mode;
    }
  };
}
