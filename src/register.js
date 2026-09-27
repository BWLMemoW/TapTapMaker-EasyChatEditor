// register.json 加载与索引

export const DEFAULT_REGISTER_URLS = [
  'scripts/easy-chat/register.json',
  'examples/register.json'
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * 解析 register.json 文本，返回结构化索引。
 * @param {string} jsonText
 * @returns {{ok:boolean, data:object, error?:string, characters:Map, scenes:Map, audios:Map, decorations:Map, variables:Map, flags:Set, ui_elements:object}}
 */
export function parseRegister(jsonText) {
  const result = {
    ok: true,
    data: null,
    error: null,
    characters: new Map(),
    scenes: new Map(),
    audios: new Map(),
    decorations: new Map(),
    variables: new Map(),
    flags: new Set(),
    customButtons: [],
    ui_elements: {}
  };

  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (err) {
    result.ok = false;
    result.error = `JSON 解析失败：${err.message}`;
    return result;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    result.ok = false;
    result.error = 'register.json 顶层必须是对象';
    return result;
  }

  result.data = data;
  result.ui_elements = asObject(data.ui_elements);
  result.customButtons = asArray(result.ui_elements.custom_buttons)
    .filter((btn) => btn && typeof btn.id === 'string' && typeof btn.signal === 'string')
    .map((btn) => ({ ...btn }));

  for (const item of asArray(data.characters)) {
    if (item && typeof item.id === 'string') {
      result.characters.set(item.id, item);
    }
  }

  for (const item of asArray(data.scenes)) {
    if (item && typeof item.id === 'string') {
      result.scenes.set(item.id, item);
    }
  }

  for (const item of asArray(data.audios)) {
    if (item && typeof item.id === 'string') {
      result.audios.set(item.id, item);
    }
  }

  for (const item of asArray(data.decorations)) {
    if (item && typeof item.id === 'string') {
      result.decorations.set(item.id, item);
    }
  }

  for (const [name, value] of Object.entries(asObject(data.variables))) {
    result.variables.set(name, value);
  }

  for (const flag of asArray(data.flags)) {
    if (typeof flag === 'string') result.flags.add(flag);
  }

  return result;
}

/**
 * 从 URL 加载并解析 register.json。
 */
export async function loadRegisterFromUrl(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`无法加载 ${url}（HTTP ${response.status}）`);
  return parseRegister(await response.text());
}

/**
 * 按默认路径依次尝试加载，全部失败则返回带错误的降级索引。
 */
export async function loadDefaultRegister() {
  let lastError = null;
  for (const url of DEFAULT_REGISTER_URLS) {
    try {
      return await loadRegisterFromUrl(url);
    } catch (err) {
      lastError = err;
    }
  }
  return {
    ok: false,
    data: null,
    error: lastError ? lastError.message : '未找到 register.json',
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

export function formatRegisterStatus(register) {
  if (!register.ok) return `register.json：加载失败（${register.error}）`;
  const counts = [
    `角色 ${register.characters.size}`,
    `场景 ${register.scenes.size}`,
    `音频 ${register.audios.size}`,
    `装饰 ${register.decorations.size}`,
    `变量 ${register.variables.size}`,
    `开关 ${register.flags.size}`,
    ...(register.customButtons?.length ? [`功能按钮 ${register.customButtons.length}`] : [])
  ];
  return `register.json：已加载（${counts.join('，')}）`;
}

/**
 * 获取某角色所有表情名。
 */
export function getExpressions(register, roleId) {
  const role = register.characters.get(roleId);
  if (!role) return [];
  const sprites = asObject(role.sprites);
  return Object.keys(sprites);
}

/**
 * 获取某角色的默认表情。
 */
export function getDefaultExpression(register, roleId) {
  const role = register.characters.get(roleId);
  return role?.default_expression || 'default';
}

/**
 * 获取某角色的显示名。
 */
export function getDisplayName(register, roleId) {
  const role = register.characters.get(roleId);
  return role?.display_name || roleId;
}

/**
 * 获取角色默认位置。
 */
export function getDefaultPosition(register, roleId) {
  const role = register.characters.get(roleId);
  return role?.default_position || 'center';
}
