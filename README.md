# Easy-ChatBox DSL 编辑器

一个简单但可用的图形化 Easy-ChatBox（EC）剧本编辑器，基于 **TypeScript 友好的现代 Web 技术栈** 实现：

- 编辑器内核：CodeMirror 6
- 构建工具：Vite
- 界面语言：中文
- 运行平台：现代浏览器（推荐 Chrome / Edge），也可以打包成桌面应用（Electron / Tauri）

> 本仓库不是 TapTap Maker 项目，也**不是** VSCode 插件；它是一个可直接 `npm run dev` 启动的独立 Web 编辑器。若你更想要 VSCode 扩展，本项目的词法 / 补全 / 校验模块可以很方便地迁移。

---

## 一、功能总览

已实现：

- ✅ **语法高亮**：注释、旁白、对话、角色 ID、表情、指令、指令参数、选项、标签定义/跳转、变量插值、富文本标签、字符串、数字、布尔值、颜色值等
- ✅ **代码补全**：
  - 输入 `@` 补全指令
  - 对话行开头补全角色 ID
  - `角色ID(` 后补全该角色表情
  - `@scene` 后补全场景 ID
  - `@bgm` / `@sfx` 后按类型补全音频 ID
  - `@decoration` 后补全装饰 ID
  - `@set` / `@if` / `{` 后补全变量和开关
  - `>>` 后补全当前剧本已定义标签
  - 常用片段：`@choice` 块、`@if/@endif`、演出序列、音频序列
  - `Ctrl+Space` 手动触发
- ✅ **register.json 集成**：
  - 启动时自动尝试加载 `scripts/easy-chat/register.json`，失败则尝试 `examples/register.json`
  - 可手动选择任意 register.json 文件
  - 支持重新加载
  - 资源面板展示角色 / 场景 / 音频 / 装饰 / 变量 / 开关 / 自定义功能按钮，支持搜索，点击插入到编辑器
  - 场景类型 `cg` 会标注「CG · 解锁收集」
- ✅ **新版手册功能**：
  - 支持 `@signal 信号名` 的语法高亮、指令补全、缺参校验
  - 支持 `ui_elements.custom_buttons` 解析与资源面板展示，`@signal` 后可补全已配置的按钮信号名
- ✅ **校验与诊断**：
  - 未闭合 `@choice` / `@if`
  - 未注册角色、表情、场景、音频、装饰
  - 音频类型不匹配
  - 选项缺少 `>> 标签`
  - 跳转目标不存在、标签重复定义
  - 错误 / 警告面板，点击跳转到对应行
- ✅ **基础编辑**：多标签、新建、打开、保存、另存为、撤销 / 重做、查找替换（CodeMirror 搜索面板）、行号、行列状态栏
- ✅ **智能缩进与结构补全**：输入 `@if 条件` 或 `@choice` 后按 Enter，自动缩进正文行并补出 `@endif` / `@end`；`@else if` / `@else` 自动对齐到对应 `@if` 的缩进
- ✅ **降级运行**：register.json 缺失或损坏时仍可高亮、指令补全、编辑剧本，并在状态栏给出提示

---

## 二、安装与运行

环境要求：Node.js 18+（建议 20+）

```bash
npm install
npm run dev
```

Vite 会自动打开 `http://localhost:5173`。

### 一键启动 exe（Windows）

项目根目录已经可以直接双击运行：

```text
EasyChatBoxEditor.exe
```

这是一个**自包含的单文件程序**，不需要安装 Node.js，也不需要先启动 Vite。它会把 `dist` 里的编辑器资源内嵌到 exe 中，启动后在 `127.0.0.1` 随机端口提供本地服务，并自动打开默认浏览器；系统托盘会出现图标，可随时重新打开或退出。

重新构建 exe（修改源码后）：

```bash
npm run build
npm run exe
```

或直接运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-exe.ps1
```

生成的文件为根目录下的 `EasyChatBoxEditor.exe`。

> 说明：exe 使用 Windows 自带的 .NET Framework 4.x 编译器（csc.exe）构建，无需额外运行时；它启动的是默认浏览器中的编辑器界面。

生产构建（Web 版本）：

```bash
npm run build
npm run preview
```

运行测试：

```bash
npm test
```

---

## 三、使用说明

### 3.1 打开 / 保存剧本

- 顶部工具栏：**新建**、**打开**、**保存**、**另存为**
- 快捷键：`Ctrl+N` 新建、`Ctrl+O` 打开、`Ctrl+S` 保存、`Ctrl+Z` 撤销、`Ctrl+Y` 重做、`Ctrl+F` 查找、`Ctrl+Space` 补全
- 浏览器支持 File System Access API 时可直接读写本地文件；不支持时保存会下载文件。

### 3.2 加载 register.json

- 默认加载顺序：`/scripts/easy-chat/register.json` → `/examples/register.json`
- 点击 **刷新资源** 可重新加载默认路径
- 点击 **资源文件** 可选择任意 `register.json`

### 3.3 资源面板

左侧资源面板按角色 / 场景 / 音频 / 装饰 / 变量 / 开关分组展示。点击任意资源项会把对应 ID 插入到编辑器当前光标处。

### 3.4 诊断面板

右侧诊断面板实时显示错误和警告。点击诊断条目会跳转到对应行。

### 3.5 配置 register.json 路径

纯浏览器版本无法读取任意本地目录，默认使用 `public/scripts/easy-chat/register.json`。

如果需要自定义默认路径，修改：

- `src/register.js` 中的 `DEFAULT_REGISTER_URLS`
- 并把你的 register.json 放到 `public/` 下对应位置

如果你需要项目级目录管理 / 文件监听，建议基于本项目再套一层 Electron 或 Tauri。

---

## 四、项目结构

```text
.
├── docs/                         # 原始需求与用户手册
├── examples/
│   ├── register.json             # 示例资源登记表
│   └── sample.chat               # 示例剧本
├── public/
│   ├── examples/                 # Vite 直接服务的示例
│   └── scripts/easy-chat/        # 默认 register.json 路径
├── scripts/
│   └── build-exe.ps1             # 生成一键启动 exe 的脚本
├── pack/                         # 构建 exe 时的临时生成目录
├── src/
│   ├── main.js                   # 应用入口 / UI 装配
│   ├── editor.js                 # CodeMirror 6 编辑器配置
│   ├── register.js               # register.json 解析与索引
│   ├── resourcePanel.js          # 左侧资源面板
│   ├── fileSystem.js             # 浏览器文件读写
│   ├── styles.css                # 深色主题样式
│   └── dsl/
│       ├── tokenizer.js          # 词法分析（高亮 / 解析共用）
│       ├── highlighter.js        # CodeMirror 高亮插件
│       ├── completion.js         # 补全候选逻辑
│       └── diagnostics.js        # 诊断 / 校验逻辑
├── tests/                        # node:test 自动化测试
├── index.html
├── vite.config.js
└── package.json
```

---

## 五、架构说明

- **词法分析**：`src/dsl/tokenizer.js` 是纯函数，按行把 DSL 切成带位置和类型的 token，不依赖 DOM。语法高亮、补全、诊断都复用它或它的辅助解析函数。
- **高亮**：`src/dsl/highlighter.js` 使用 CodeMirror 6 `ViewPlugin` 对可见行生成 `Decoration`，按 token 类型套用 CSS 类。
- **补全**：`src/dsl/completion.js` 根据光标前的行文本 + register 索引 + 当前文档标签列表返回候选。CodeMirror 在 `src/editor.js` 中通过 `autocompletion({ override })` 接入。
- **诊断**：`src/dsl/diagnostics.js` 是纯函数，扫描全文后输出 CodeMirror lint 诊断。register 缺失时自动跳过 ID 校验，只保留语法 / 块结构诊断。
- **状态**：应用层持有 `registerRef` 对象，编辑器补全和 lint 读取同一个引用；重新加载 register.json 时无需重建编辑器。

---

## 六、Easy-ChatBox DSL 语法速查

```text
# 注释
* 旁白文本
alice:"你好，世界。"
alice(happy):"今天天气真好！"

@scene bg_classroom fade 1.0
@show alice default center slide_left
@wait 0.6

@choice
- "你好呀" >> say_hi
- "再见" >> say_bye
@timeout 8 >> say_timeout
@end

> say_hi
@set affection_alice +1
alice:"很高兴认识你！"
>> the_end

> the_end
@end
```

完整语法说明见 `docs/用户使用手册.md`。

---

## 七、扩展指南

### 7.1 新增指令

1. 在 `src/dsl/tokenizer.js` 的 `COMMANDS` 中追加指令名。
2. 在 `src/dsl/completion.js` 的 `COMMAND_INFO` 中补说明。
3. 如果新指令需要资源补全，在 `commandArgOptions` 增加分支。
4. 如果新指令需要校验，在 `src/dsl/diagnostics.js` 增加对应检查。

### 7.2 新增资源类型

1. 在 `src/register.js` 的 `parseRegister` 中建立新 Map。
2. 在 `src/dsl/completion.js` 增加对应补全选项构造器。
3. 在 `src/resourcePanel.js` 增加面板分组。
4. 在 `src/dsl/diagnostics.js` 增加 ID 校验。

### 7.3 修改配色

编辑 `src/styles.css` 中 `:root` 的 `--token-*` 变量，或直接修改 `.cm-ec-token.cm-ec-*` 规则。

---

## 八、已知限制

- 一键启动 exe 是“本地服务 + 默认浏览器”方案，不包含内嵌 Chromium 窗口；如果需要完全独立的桌面窗口，可再套 Electron / Tauri。
- 浏览器沙箱无法直接读取任意项目目录；需要完整项目级目录树 / 文件监听时，请套 Electron / Tauri。
- 查找 / 替换使用 CodeMirror 搜索面板，支持正则 / 区分大小写等选项。
- 当前高亮按“可见行”动态构建，1 万行剧本滚动流畅；完整文档级 lint 每次修改重新计算，常规剧本体量下无明显延迟。
- 子剧本（`@call`）文件补全尚未接入项目文件扫描，可通过扩展 `commandArgOptions` 中的 `call` 分支实现。
#   T a p T a p M a k e r - E a s y C h a t E d i t o r  
 