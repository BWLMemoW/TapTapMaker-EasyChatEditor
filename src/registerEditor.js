// 图形化注册编辑器：可视化新增/编辑/删除 register.json 中的各类注册项

const SECTION_ORDER = ['characters', 'scenes', 'audios', 'decorations', 'variables', 'flags', 'customButtons'];

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function emptyData() {
  return {
    ui_elements: { custom_buttons: [] },
    characters: [],
    scenes: [],
    audios: [],
    decorations: [],
    variables: {},
    flags: []
  };
}

function normalizeData(raw) {
  const base = emptyData();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  const ui = raw.ui_elements && typeof raw.ui_elements === 'object' && !Array.isArray(raw.ui_elements)
    ? { ...raw.ui_elements }
    : {};
  if (!ui.custom_buttons) ui.custom_buttons = [];

  return {
    ui_elements: ui,
    characters: Array.isArray(raw.characters) ? clone(raw.characters) : [],
    scenes: Array.isArray(raw.scenes) ? clone(raw.scenes) : [],
    audios: Array.isArray(raw.audios) ? clone(raw.audios) : [],
    decorations: Array.isArray(raw.decorations) ? clone(raw.decorations) : [],
    variables: raw.variables && typeof raw.variables === 'object' && !Array.isArray(raw.variables)
      ? { ...raw.variables }
      : {},
    flags: Array.isArray(raw.flags) ? clone(raw.flags) : []
  };
}

const SECTIONS = {
  characters: {
    label: '角色',
    collection: 'array',
    itemLabel: (item) => item.id || '(未命名角色)',
    idKey: 'id',
    fields: [
      { key: 'id', label: 'ID', type: 'text', required: true, placeholder: 'alice' },
      { key: 'display_name', label: '显示名', type: 'text', placeholder: '爱丽丝' },
      { key: 'name_color', label: '名字颜色', type: 'color' },
      { key: 'sprites', label: '表情 → 立绘', type: 'map', keyPlaceholder: 'default', valuePlaceholder: 'Textures/Characters/alice/default.png' },
      { key: 'default_expression', label: '默认表情', type: 'text', placeholder: 'default' },
      { key: 'default_position', label: '默认位置', type: 'select', options: ['center', 'left', 'right'] },
      { key: 'scale', label: '缩放', type: 'number', step: 0.1 },
      { key: 'offset', label: '偏移(x,y)', type: 'offset' },
      { key: 'image_name_tag', label: '图片姓名条', type: 'text', placeholder: 'Textures/UI/name_tag.png' },
      { key: 'is_narrator', label: '旁白角色', type: 'checkbox' }
    ]
  },
  scenes: {
    label: '场景',
    collection: 'array',
    itemLabel: (item) => item.id || '(未命名场景)',
    idKey: 'id',
    fields: [
      { key: 'id', label: 'ID', type: 'text', required: true, placeholder: 'bg_classroom' },
      { key: 'type', label: '类型', type: 'select', options: ['background', 'cg'] },
      { key: 'image', label: '图片', type: 'text', placeholder: 'Textures/Scenes/classroom.png' },
      { key: 'transition', label: '默认转场', type: 'text', placeholder: 'fade' },
      { key: 'duration', label: '停留时长', type: 'number', step: 0.1 }
    ]
  },
  audios: {
    label: '音频',
    collection: 'array',
    itemLabel: (item) => item.id || '(未命名音频)',
    idKey: 'id',
    fields: [
      { key: 'id', label: 'ID', type: 'text', required: true, placeholder: 'bgm_daily' },
      { key: 'type', label: '类型', type: 'select', options: ['bgm', 'sfx'] },
      { key: 'file', label: '文件', type: 'text', placeholder: 'Audio/BGM/daily_life.ogg' },
      { key: 'loop', label: '循环', type: 'checkbox' },
      { key: 'volume', label: '音量', type: 'number', step: 0.1, min: 0, max: 1 }
    ]
  },
  decorations: {
    label: '装饰',
    collection: 'array',
    itemLabel: (item) => item.id || '(未命名装饰)',
    idKey: 'id',
    fields: [
      { key: 'id', label: 'ID', type: 'text', required: true, placeholder: 'vignette' },
      { key: 'image', label: '图片', type: 'text', placeholder: 'Textures/UI/decor_vignette.png' },
      { key: 'description', label: '描述', type: 'text', placeholder: '暗角' }
    ]
  },
  variables: {
    label: '变量',
    collection: 'map',
    itemLabel: (key) => key,
    idKey: '__key',
    fields: []
  },
  flags: {
    label: '开关',
    collection: 'list',
    itemLabel: (item) => item,
    idKey: '__self',
    fields: []
  },
  customButtons: {
    label: '按钮',
    collection: 'array',
    itemLabel: (item) => item.label || item.id || '(未命名按钮)',
    idKey: 'id',
    requiredKeys: ['id', 'signal'],
    path: ['ui_elements', 'custom_buttons'],
    fields: [
      { key: 'id', label: 'ID', type: 'text', required: true, placeholder: 'ec_shop_btn' },
      { key: 'label', label: '文字', type: 'text', placeholder: '商店' },
      { key: 'signal', label: 'signal', type: 'text', required: true, placeholder: 'open_shop' },
      { key: 'style', label: '样式', type: 'text', placeholder: 'default' },
      { key: 'size', label: '尺寸', type: 'number' }
    ]
  }
};

function parseNumber(value, fallback = undefined) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

function parseVariableValue(text) {
  const t = String(text).trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t !== '' && !Number.isNaN(Number(t))) return Number(t);
  return text;
}

function valueToInput(val, type) {
  if (type === 'checkbox') return val ? 'checked' : '';
  if (val === undefined || val === null) return '';
  return String(val);
}

function createInput(field, value) {
  if (field.type === 'select') {
    const sel = document.createElement('select');
    sel.className = 're-input re-select';
    for (const opt of field.options) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      if (opt === value) o.selected = true;
      sel.appendChild(o);
    }
    return sel;
  }

  if (field.type === 'checkbox') {
    const wrap = document.createElement('label');
    wrap.className = 're-checkbox';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!value;
    wrap.appendChild(cb);
    wrap.appendChild(document.createTextNode(' 是'));
    return wrap;
  }

  const input = document.createElement('input');
  input.className = 're-input';
  input.placeholder = field.placeholder || '';
  if (field.type === 'color') {
    input.type = 'color';
    input.value = typeof value === 'string' && /^#/.test(value) ? value : '#FF6B9D';
  } else if (field.type === 'number') {
    input.type = 'number';
    input.step = String(field.step || 1);
    if (field.min !== undefined) input.min = field.min;
    if (field.max !== undefined) input.max = field.max;
    input.value = valueToInput(value, field.type);
  } else {
    input.type = 'text';
    input.value = valueToInput(value, field.type);
  }
  return input;
}

function createMapEditor(field, value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 're-map';
  const current = { ...(value || {}) };

  function addRow(key, val) {
    const row = document.createElement('div');
    row.className = 're-map-row';
    let trackKey = key; // 该行当前映射到的真实键名

    const k = document.createElement('input');
    k.className = 're-input re-map-key';
    k.placeholder = field.keyPlaceholder || '键';
    k.value = key;

    const v = document.createElement('input');
    v.className = 're-input re-map-val';
    v.placeholder = field.valuePlaceholder || '值';
    v.value = val;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 're-mini';
    del.textContent = '×';
    del.addEventListener('click', () => {
      if (trackKey) delete current[trackKey];
      row.remove();
      onChange({ ...current });
    });

    const sync = () => {
      const keyName = k.value;
      const newVal = v.value;
      // 键被改名：先把旧键删除，再写入新键
      if (keyName !== trackKey) {
        if (keyName) {
          if (trackKey) delete current[trackKey];
          current[keyName] = newVal;
          trackKey = keyName;
        } else {
          // 空键时先保留原状态，避免误删
          if (trackKey) delete current[trackKey];
          trackKey = '';
        }
      } else if (keyName) {
        current[keyName] = newVal;
      }
      onChange({ ...current });
    };
    k.addEventListener('input', sync);
    v.addEventListener('input', sync);

    row.append(k, v, del);
    wrap.appendChild(row);
  }

  for (const [key, val] of Object.entries(current)) addRow(key, val);
  if (!Object.keys(current).length) addRow('', '');

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 're-add';
  add.textContent = '+ 新增表情';
  add.addEventListener('click', () => addRow('', ''));
  wrap.appendChild(add);

  return wrap;
}

function createOffsetEditor(field, value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 're-offset';
  const offset = { x: 0, y: 0, ...(value || {}) };

  const x = createInput({ type: 'number', step: 1 }, offset.x);
  x.classList.add('re-input');
  const y = createInput({ type: 'number', step: 1 }, offset.y);
  y.classList.add('re-input');

  const sync = () => onChange({ x: parseNumber(x.value, 0), y: parseNumber(y.value, 0) });
  x.addEventListener('input', sync);
  y.addEventListener('input', sync);

  wrap.appendChild(x);
  wrap.appendChild(document.createTextNode(' , '));
  wrap.appendChild(y);
  return wrap;
}

/**
 * 创建图形化注册编辑器。
 * @param {HTMLElement} container
 * @param {{ok:boolean, data:object|undefined}} register
 * @param {{onSave:(jsonText:string)=>void, onClose:()=>void}} callbacks
 */
export function createRegisterEditor(container, register, callbacks) {
  const root = document.createElement('div');
  root.className = 'register-editor';

  let data = normalizeData(register && register.ok ? register.data : null);
  let activeSection = 'characters';
  let editingItemId = null; // null 表示列表视图；字符串表示正在编辑某条

  const header = document.createElement('div');
  header.className = 're-header';
  const title = document.createElement('div');
  title.className = 're-title';
  title.textContent = '注册编辑器';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 're-mini';
  closeBtn.textContent = '✕';
  closeBtn.title = '返回浏览';
  closeBtn.addEventListener('click', () => callbacks.onClose && callbacks.onClose());
  header.append(title, closeBtn);

  const tabs = document.createElement('div');
  tabs.className = 're-tabs';

  const body = document.createElement('div');
  body.className = 're-body';

  const footer = document.createElement('div');
  footer.className = 're-footer';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 're-save';
  saveBtn.textContent = '保存注册表';
  const discardBtn = document.createElement('button');
  discardBtn.type = 'button';
  discardBtn.className = 're-discard';
  discardBtn.textContent = '放弃修改';
  footer.append(saveBtn, discardBtn);

  root.append(header, tabs, body, footer);
  container.appendChild(root);

  function getSection() {
    return SECTIONS[activeSection];
  }

  function getCollection() {
    const sec = getSection();
    const path = sec.path || [activeSection];
    let node = data;
    for (const p of path) node = node[p];
    return node;
  }

  function setCollection(node) {
    const sec = getSection();
    const path = sec.path || [activeSection];
    let target = data;
    for (let i = 0; i < path.length - 1; i++) target = target[path[i]];
    target[path[path.length - 1]] = node;
  }

  function renderTabs() {
    tabs.textContent = '';
    for (const key of SECTION_ORDER) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 're-tab' + (key === activeSection ? ' active' : '');
      btn.textContent = SECTIONS[key].label;
      btn.addEventListener('click', () => {
        activeSection = key;
        editingItemId = null;
        renderTabs();
        renderBody();
      });
      tabs.appendChild(btn);
    }
  }

  function renderBody() {
    body.textContent = '';
    const sec = getSection();
    if (sec.collection === 'map') return renderMap();
    if (sec.collection === 'list') return renderList();
    return renderArray();
  }

  function renderArray() {
    const sec = getSection();
    const coll = getCollection();

    if (editingItemId !== null) {
      const idx = coll.findIndex((it) => it[sec.idKey] === editingItemId);
      const item = idx >= 0 ? coll[idx] : null;
      if (item) {
        renderItemForm(sec, item, (next) => {
          coll[idx] = next;
          editingItemId = null;
          renderBody();
        });
        return;
      }
      editingItemId = null;
    }

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 're-add re-add-top';
    add.textContent = `+ 新增${sec.label}`;
    add.addEventListener('click', () => {
      const item = {};
      item[sec.idKey] = '';
      coll.push(item);
      editingItemId = '';
      renderBody();
    });
    body.appendChild(add);

    const list = document.createElement('div');
    list.className = 're-list';
    for (const item of coll) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 're-row';
      row.textContent = sec.itemLabel(item);
      row.addEventListener('click', () => {
        editingItemId = item[sec.idKey];
        renderBody();
      });
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  function renderMap() {
    const vars = data.variables;
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 're-add re-add-top';
    add.textContent = '+ 新增变量';
    add.addEventListener('click', () => {
      const name = window.prompt('变量名', 'var_name');
      if (name) {
        data.variables[name] = 0;
        renderBody();
      }
    });
    body.appendChild(add);

    const list = document.createElement('div');
    list.className = 're-list';
    for (const key of Object.keys(vars)) {
      const row = document.createElement('div');
      row.className = 're-map-var';

      const nameInput = document.createElement('input');
      nameInput.className = 're-input';
      nameInput.value = key;
      const valInput = document.createElement('input');
      valInput.className = 're-input re-input-num';
      valInput.value = String(vars[key]);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 're-mini';
      del.textContent = '×';
      del.addEventListener('click', () => {
        delete data.variables[key];
        renderBody();
      });

      nameInput.addEventListener('change', () => {
        const newKey = nameInput.value.trim();
        if (newKey && newKey !== key && !(newKey in data.variables)) {
          data.variables[newKey] = data.variables[key];
          delete data.variables[key];
          renderBody();
        } else {
          nameInput.value = key;
        }
      });
      valInput.addEventListener('change', () => {
        data.variables[key] = parseVariableValue(valInput.value);
      });

      row.append(nameInput, valInput, del);
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  function renderList() {
    const flags = data.flags;
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 're-add re-add-top';
    add.textContent = '+ 新增开关';
    add.addEventListener('click', () => {
      const name = window.prompt('开关名', 'flag_name');
      if (name) {
        data.flags.push(name);
        renderBody();
      }
    });
    body.appendChild(add);

    const list = document.createElement('div');
    list.className = 're-list';
    for (const flag of flags) {
      const row = document.createElement('div');
      row.className = 're-row re-row-static';
      const label = document.createElement('span');
      label.textContent = flag;
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 're-mini';
      del.textContent = '×';
      del.addEventListener('click', () => {
        const idx = data.flags.indexOf(flag);
        if (idx >= 0) data.flags.splice(idx, 1);
        renderBody();
      });
      row.append(label, del);
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  function renderItemForm(sec, item, onDone) {
    const form = document.createElement('div');
    form.className = 're-form';

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 're-back';
    back.textContent = '← 返回列表';
    back.addEventListener('click', () => {
      editingItemId = null;
      renderBody();
    });
    form.appendChild(back);

    const controls = [];
    for (const field of sec.fields) {
      const row = document.createElement('div');
      row.className = 're-field';
      const lab = document.createElement('label');
      lab.className = 're-field-label';
      lab.textContent = field.label + (field.required ? ' *' : '');
      row.appendChild(lab);

      if (field.type === 'map') {
        const mapEl = createMapEditor(field, item[field.key], (v) => { item[field.key] = v; });
        row.appendChild(mapEl);
      } else if (field.type === 'offset') {
        const offEl = createOffsetEditor(field, item[field.key], (v) => { item[field.key] = v; });
        row.appendChild(offEl);
      } else {
        const input = createInput(field, item[field.key]);
        controls.push({ field, input });
        row.appendChild(input);
      }
      form.appendChild(row);
    }

    const ops = document.createElement('div');
    ops.className = 're-form-ops';

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 're-danger';
    del.textContent = '删除这条';
    del.addEventListener('click', () => {
      if (!window.confirm(`确认删除「${sec.itemLabel(item)}」？`)) return;
      const coll = getCollection();
      const idx = coll.findIndex((it) => it[sec.idKey] === item[sec.idKey]);
      if (idx >= 0) coll.splice(idx, 1);
      editingItemId = null;
      renderBody();
    });
    ops.appendChild(del);

    const saveItem = document.createElement('button');
    saveItem.type = 'button';
    saveItem.className = 're-save';
    saveItem.textContent = '保存此条';
    saveItem.addEventListener('click', () => {
      for (const { field, input } of controls) {
        if (field.type === 'checkbox') {
          item[field.key] = input.checked;
        } else if (field.type === 'number') {
          const n = parseNumber(input.value);
          if (n !== undefined) item[field.key] = n;
          else delete item[field.key];
        } else if (field.type === 'color') {
          item[field.key] = input.value || '#FF6B9D';
        } else {
          const v = input.value;
          if (v === '') delete item[field.key];
          else item[field.key] = v;
        }
      }
      const requiredKeys = sec.requiredKeys || [sec.idKey];
      const missing = requiredKeys.filter((k) => !item[k]);
      if (missing.length) {
        const labels = missing.map((k) => {
          const f = sec.fields.find((x) => x.key === k);
          return f ? f.label : k;
        });
        window.alert(`请填写必填字段：${labels.join('、')}。`);
        return;
      }
      onDone({ ...item });
    });
    ops.appendChild(saveItem);

    form.appendChild(ops);
    body.appendChild(form);
  }

  saveBtn.addEventListener('click', () => {
    const json = JSON.stringify(data, null, 2);
    callbacks.onSave && callbacks.onSave(json);
  });

  discardBtn.addEventListener('click', () => {
    if (!window.confirm('放弃全部未保存的注册表修改？')) return;
    data = normalizeData(register && register.ok ? register.data : null);
    activeSection = 'characters';
    editingItemId = null;
    renderTabs();
    renderBody();
  });

  renderTabs();
  renderBody();

  return {
    getData() {
      return data;
    },
    setRegister(newRegister) {
      data = normalizeData(newRegister && newRegister.ok ? newRegister.data : null);
      editingItemId = null;
      renderTabs();
      renderBody();
    },
    refresh() {
      renderTabs();
      renderBody();
    }
  };
}
