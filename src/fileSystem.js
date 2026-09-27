// 浏览器文件读写：优先 File System Access API，降级到 input/download。

const TEXT_EXTENSIONS = ['.txt', '.chat', '.ec.txt', '.json'];

export async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function isTextFile(name) {
  const lower = name.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext)) || lower.endsWith('.json');
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function openFileWithDialog() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'Easy-ChatBox 剧本 / JSON',
            accept: {
              'text/plain': ['.txt', '.chat'],
              'application/json': ['.json']
            }
          }
        ],
        multiple: false
      });
      const file = await handle.getFile();
      const text = await readFileAsText(file);
      return { name: file.name, text, handle };
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
      // 降级到 input
    }
  }
  return openFileWithInput();
}

export function openFileWithInput() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.chat,.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const text = await readFileAsText(file);
      resolve({ name: file.name, text, handle: null });
    });
    input.click();
  });
}

export async function saveFileToPath(path, content) {
  try {
    // 用“路径\n内容”的纯文本协议代替 JSON，避免大文件在浏览器端 JSON.stringify、
    // 以及 exe 端 JavaScriptSerializer 反序列化造成的卡顿。
    const response = await fetchWithTimeout('/__ec_write_file', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: `${path}\n${content}`
    }, 5000);
    if (!response.ok) return false;
    const data = await response.json();
    return !!(data && data.ok);
  } catch {
    return false;
  }
}

/**
 * 从磁盘路径读取文件文本（exe 模式经后端接口读取）。
 * @param {string} path 目标文件的绝对路径
 * @returns {Promise<string|null>} 文本内容，失败返回 null
 */
export async function readFileFromPath(path) {
  if (!path) return null;
  try {
    const response = await fetchWithTimeout('/__ec_read_file', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: path
    }, 5000);
    if (!response.ok) return null;
    const data = await response.json();
    // 返回 { ok:true, text:"...", path:"..." }
    if (data && data.ok && typeof data.text === 'string') return data.text;
    return null;
  } catch {
    return null;
  }
}

export async function writeToHandle(handle, content) {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function saveFileWithNativeDialog(name, content) {
  try {
    // 原生保存对话框允许用户思考较久，因此超时给得很宽（5 分钟），
    // 避免用户还在选路径时前端超时又弹出第二个保存框。
    // 同样使用“文件名\n内容”的纯文本协议，避免大文件 JSON 编解码。
    const response = await fetchWithTimeout('/__ec_save_file', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: `${name}\n${content}`
    }, 300000);
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.path) return data;
  } catch {
    // 开发模式没有原生保存接口 / 本地服务超时
  }
  return null;
}

export async function saveFileWithDialog(handle, name, content) {
  // 1) exe 原生保存对话框（可靠，能真正写盘并记住路径）
  const native = await saveFileWithNativeDialog(name, content);
  if (native) {
    return { ok: true, handle: null, name: native.name || name, path: native.path };
  }

  // 2) File System Access API
  if (handle && window.showSaveFilePicker) {
    try {
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return { ok: true, handle, name: handle.name || name };
    } catch (err) {
      if (err && err.name === 'AbortError') return { ok: false };
    }
  }

  if (window.showSaveFilePicker) {
    try {
      const newHandle = await window.showSaveFilePicker({
        suggestedName: name || 'script.txt',
        types: [
          {
            description: 'Easy-ChatBox 剧本',
            accept: { 'text/plain': ['.txt', '.chat'] }
          }
        ]
      });
      const writable = await newHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return { ok: true, handle: newHandle, name: newHandle.name || name };
    } catch (err) {
      if (err && err.name === 'AbortError') return { ok: false };
    }
  }

  // 3) 降级：下载文件
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'script.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true, handle: null, name: name || 'script.txt', downloaded: true };
}

export function downloadJson(filename, content) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- register.json 文件句柄持久化（File System Access API） ----

const REGISTER_HANDLE_DB = 'easy-chat-editor';
const REGISTER_HANDLE_STORE = 'register-handle';

function openRegisterHandleDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = window.indexedDB.open(REGISTER_HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(REGISTER_HANDLE_STORE)) {
        db.createObjectStore(REGISTER_HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRegisterHandle(handle) {
  const db = await openRegisterHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REGISTER_HANDLE_STORE, 'readwrite');
    tx.objectStore(REGISTER_HANDLE_STORE).put(handle, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadRegisterHandle() {
  const db = await openRegisterHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REGISTER_HANDLE_STORE, 'readonly');
    const request = tx.objectStore(REGISTER_HANDLE_STORE).get('current');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function pickRegisterHandle() {
  if (!window.showOpenFilePicker) return null;
  const [handle] = await window.showOpenFilePicker({
    types: [
      {
        description: 'register.json',
        accept: { 'application/json': ['.json'] }
      }
    ],
    multiple: false
  });
  return handle;
}

export async function requestHandlePermission(handle) {
  const options = { mode: 'read' };
  try {
    if (await handle.queryPermission(options) === 'granted') return true;
    if (await handle.requestPermission(options) === 'granted') return true;
  } catch {
    // ignore
  }
  return false;
}

export async function readHandleFile(handle) {
  const file = await handle.getFile();
  return readFileAsText(file);
}
