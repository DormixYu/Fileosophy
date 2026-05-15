# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**全程使用中文交流，代码和专业名词除外。**
### 1. 编码前思考

**不要假设。不要隐藏困惑。呈现权衡。**

LLM 经常默默选择一种解释然后执行。这个原则强制明确推理：

- **明确说明假设** — 如果不确定，询问而不是猜测
- **呈现多种解释** — 当存在歧义时，不要默默选择
- **适时提出异议** — 如果存在更简单的方法，说出来
- **困惑时停下来** — 指出不清楚的地方并要求澄清

### 2. 简洁优先

**用最少的代码解决问题。不要过度推测。**

对抗过度工程的倾向：

- 不要添加要求之外的功能
- 不要为一次性代码创建抽象
- 不要添加未要求的"灵活性"或"可配置性"
- 不要为不可能发生的场景做错误处理
- 如果 200 行代码可以写成 50 行，重写它

**检验标准：** 资深工程师会觉得这过于复杂吗？如果是，简化。

### 3. 精准修改

**只碰必须碰的。只清理自己造成的混乱。**

编辑现有代码时：

- 不要"改进"相邻的代码、注释或格式
- 不要重构没坏的东西
- 匹配现有风格，即使你更倾向于不同的写法
- 如果注意到无关的死代码，提一下 —— 不要删除它

当你的改动产生孤儿代码时：

- 删除因你的改动而变得无用的导入/变量/函数
- 不要删除预先存在的死代码，除非被要求

**检验标准：** 每一行修改都应该能直接追溯到用户的请求。

### 4. 目标驱动执行

**定义成功标准。循环验证直到达成。**

将指令式任务转化为可验证的目标：

| 不要这样做... | 转化为... |
|--------------|-----------------|
| "添加验证" | "为无效输入编写测试，然后让它们通过" |
| "修复 bug" | "编写重现 bug 的测试，然后让它通过" |
| "重构 X" | "确保重构前后测试都能通过" |

对于多步骤任务，说明一个简短的计划：

```
1. [步骤] → 验证: [检查]
2. [步骤] → 验证: [检查]
3. [步骤] → 验证: [检查]
```

## 构建与运行

```bash
# 仅启动前端开发服务器（端口 1420）
npm run dev

# 启动完整 Tauri 桌面应用（开发模式）
npm run tauri dev

# 前端类型检查
npx tsc --noEmit

# 前端 Lint
npm run lint
npm run lint:fix

# 前端格式化
npm run format
npm run format:check

# 生产构建
npm run tauri build

# Rust：仅编译后端
cd src-tauri && cargo build

# Rust：运行测试
cd src-tauri && cargo test
```

## 项目概述

**Fileosophy** 是一个桌面项目管理工具（看板、甘特图、文件共享、局域网协作）。由 Electron 迁移至 **Tauri 2.x** 架构，后端用 Rust 重写，前端保持 React 18 + TypeScript。数据库使用 SQLite（`rusqlite` bundled 模式）。

性能目标：安装包 < 10MB，冷启动 < 1.5s，内存空闲 < 50MB。

## 技术栈（不可随意更换）

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri 2.x |
| 前端框架 | React 18 + TypeScript（严格模式） |
| 构建工具 | Vite |
| 样式 | Tailwind CSS（暖色调/羊皮纸质感） |
| 状态管理 | Zustand（按领域拆分 store） |
| 拖拽 | @dnd-kit/core + @dnd-kit/sortable（看板卡片拖拽） |
| 后端语言 | Rust 2021 edition |
| 数据库 | SQLite（rusqlite bundled） |
| 网络发现 | mdns-sd crate（局域网 mDNS） |
| 快捷键 | tauri-plugin-global-shortcut |
| 文件对话框 | tauri-plugin-dialog |
| 文件系统 | tauri-plugin-fs（读取本地文件） |

## 通信方式

- **前端 → 后端**：`invoke('command_name', { args })` — 所有 invoke 调用封装在 `src/lib/tauri-api.ts`，页面/store 中禁止直接裸调 `invoke`
- **后端 → 前端**：`app_handle.emit(event_name, payload)` + 前端 `listen(event_name, callback)`
- **禁止**：不使用 HTTP/WebSocket/`fetch` 到 localhost，纯 Tauri IPC

## 通知系统

两层架构：
1. **Toast 弹窗**：`useNotificationStore.addToast()` → 前端即时弹出（5 秒自动消失），同时持久化到后端
2. **通知历史**：存储在 `settings` 表 `notification_history` key（JSON 数组），通过 `NotificationCenter` 面板查看

后端通过 `events::emit_notification(app, type, title, message, link)` 发送通知事件，前端 `ToastContainer` 监听 `app-notification` 事件。通知支持可选 `link` 字段，点击可跳转到对应路由。通知偏好存储在 `settings` 表 `notification_preferences` key。

注意：`@tauri-apps/plugin-notification` JS 包已安装但 Rust 后端尚未集成（Cargo.toml 无依赖，lib.rs 无注册），系统原生通知暂不可用。

## 后端架构（`src-tauri/src/`）

- `main.rs` — 入口，调用 `fileosophy_lib::run()`
- `lib.rs` — `run()` 函数：注册 Tauri 插件（dialog、fs、shell、global-shortcut），初始化数据库连接（`Mutex<Connection>`），启动文件传输 TCP 服务器，注册 mDNS 服务发现，注册所有 IPC 命令
- `commands/` — Tauri `#[tauri::command]`，按领域拆分：
  - `projects.rs` — 项目 CRUD、状态历史、里程碑管理、打开文件夹/文件、获取本机 IP，定义 `DbConn` 类型别名
  - `kanban.rs` — 看板列和卡片操作
  - `gantt.rs` — 甘特图任务 CRUD
  - `files.rs` — 文件上传/删除/列表/局域网共享/文件夹树扫描（`list_folder_contents`），定义 `MdnsState` 类型别名
  - `folder_share.rs` — 文件夹局域网分享：TCP 服务器 + 密码认证 + 目录浏览/下载，定义 `FolderShareState` 类型别名
  - `settings.rs` — 应用设置读取/写入，项目导入导出（JSON 完整数据或 CSV 摘要），全局搜索，通知管理（含已读/偏好），项目文件夹扫描导入
  - `user.rs` — 用户资料管理（获取/创建/更新用户、头像上传）
- `db/` — 数据库层：
  - `connection.rs` — 初始化连接，数据库文件位于 `$APP_DATA/fileosophy.db`
  - `migrations.rs` — 建表语句（8 张表 + 索引），外键 `ON DELETE CASCADE`，增量迁移
  - `models.rs` — 所有数据模型的 Rust struct，实现 `Serialize + Deserialize`
- `events/mod.rs` — 事件名称常量 + `emit_notification()` 公共函数：
  - `project-updated` — 项目数据变更
  - `card-moved` — 卡片跨列移动
  - `file-shared` — 文件共享/接收通知
  - `app-notification` — 系统通知（含可选 `link` 字段用于前端跳转）
- `mdns/mod.rs` — mDNS 服务发现，注册 `_fileosophy._tcp.local.`，发现局域网同类实例
- `sharing/mod.rs` — TCP 文件传输：4 字节大端长度前缀 + JSON header + 文件内容

后端命令执行数据变更后必须 `emit()` 对应事件，前端据此刷新状态。

## 文件管理架构

两种模式并存：
- **文件夹树模式**：`FileExplorer` 有 `folderPath` 时，调用 `list_folder_contents` 递归扫描项目实际文件夹，显示目录树，双击文件通过后端 `open_file` 命令（`cmd /c start`）用系统默认程序打开
- **数据库模式**：无 `folderPath` 时，显示通过应用上传到 `{app_data_dir}/files/{project_id}/` 的文件（UUID 重命名），记录在 `project_files` 表

## 前端架构（`src/`）

- `App.tsx` — React Router 路由：
  - `/` → DashboardPage（概览统计）
  - `/projects` → ProjectListPage（项目列表）
  - `/project/:id` → ProjectDetailPage（看板/甘特图/文件切换）
  - `/gantt` → GanttPage（全局甘特图，跨项目任务汇总）
  - `/sharing` → SharingPage（局域网共享管理，含我的分享/连接他人/远程文件浏览）
  - `/settings` → SettingsPage（主题、快捷键、数据管理）
  - 全局快捷键：`Ctrl+Shift+N` 快速新建、`Ctrl+Shift+F` 全局搜索、`Ctrl+Shift+S` 显示/隐藏窗口
- `lib/tauri-api.ts` — 所有后端 IPC 调用封装，按领域分对象导出：`projectApi`、`kanbanApi`、`ganttApi`、`fileApi`、`settingsApi`、`notificationHistoryApi`、`searchApi`、`exportApi`、`folderApi`、`shortcutApi`、`shareApi`、`systemApi`、`userApi`。除此之外任何地方不得裸调 `invoke`
- `lib/ganttUtils.ts` — 甘特图工具函数（视图模式、日期计算、格式化等）
- `stores/` — Zustand 按领域拆分：`useProjectStore`、`useKanbanStore`、`useGanttStore`、`useSettingsStore`、`useNotificationStore`（含 Toast + 历史 + 偏好）、`useUserStore`、`useShareStore`
- `components/` — UI 组件，按功能分目录：
  - `kanban/` — Board / Column / Card，使用 @dnd-kit 拖拽
  - `gantt/` — GanttChart 甘特图组件
  - `files/` — FilePanel（完整版文件管理）、FileExplorer（文件夹树浏览 + 数据库文件列表双模式）、FilePreviewModal（预览弹窗）、`previews/`（TextPreview / ImagePreview / MarkdownPreview）
  - `notifications/` — NotificationCenter、ToastContainer
  - `sharing/` — MyShares、ConnectShare、ActiveShareRow、ConnectedPeerRow、RemoteFileBrowser
  - `common/` — Modal、Dropdown、Spinner、EmptyState、QuickAddPanel（快速新建）、GlobalSearch（全局搜索）、ShareProjectDialog（项目分享）、DatePicker
- `types/index.ts` — 所有 TypeScript 接口，与 Rust 模型一一对应，含事件载荷类型
- 路径别名 `@/` → `src/`（在 `vite.config.ts` 和 `tsconfig.json` 中配置）

## 数据库表结构（SQLite）

```sql
projects(id INTEGER PK AUTOINCREMENT, name TEXT, description TEXT, created_at TEXT, updated_at TEXT, project_number TEXT, project_type TEXT, status TEXT, start_date TEXT, end_date TEXT, status_changed_at TEXT, created_by TEXT, folder_path TEXT)
kanban_columns(id INTEGER PK AUTOINCREMENT, project_id INTEGER FK CASCADE, title TEXT, position INTEGER, column_type TEXT, created_at TEXT)
kanban_cards(id INTEGER PK AUTOINCREMENT, column_id INTEGER FK CASCADE, title TEXT, description TEXT, position INTEGER, tags TEXT, gantt_task_id INTEGER, due_date TEXT, created_at TEXT, updated_at TEXT)
gantt_tasks(id INTEGER PK AUTOINCREMENT, project_id INTEGER FK CASCADE, name TEXT, start_date TEXT, duration_days INTEGER, dependencies TEXT, progress REAL, created_at TEXT)
project_files(id INTEGER PK AUTOINCREMENT, project_id INTEGER FK CASCADE, original_name TEXT, stored_name TEXT, size INTEGER, uploaded_at TEXT)
settings(key TEXT PK, value TEXT)
users(id INTEGER PK AUTOINCREMENT, name TEXT NOT NULL, avatar_path TEXT, created_at TEXT)
project_status_history(id INTEGER PK AUTOINCREMENT, project_id INTEGER FK CASCADE, status TEXT, changed_at TEXT)
project_milestones(id INTEGER PK AUTOINCREMENT, project_id INTEGER FK CASCADE, name TEXT, date TEXT, description TEXT, created_at TEXT)
```

- `tags` 和 `dependencies` 以 JSON 字符串存储在 SQLite 中（如 `'["tag1","tag2"]'`、`'[1,2,3]'`）
- 所有 ID 类型为 `i64`（对应 INTEGER PRIMARY KEY AUTOINCREMENT）
- 数据库文件路径：`$APP_DATA/fileosophy.db`（通过 `app.path().app_data_dir()` 获取）
- 增量迁移通过 `column_exists()` 检查列是否已存在后再 `ALTER TABLE ADD COLUMN`，避免重复执行报错

## 看板-甘特图联动

卡片和甘特图任务可以双向关联：
- **link_card_to_gantt**：从看板卡片创建关联甘特图任务（自动创建 gantt_task 并将 `gantt_task_id` 写入 kanban_card）
- **unlink_card_from_gantt**：解除关联（清除卡片上的 `gantt_task_id`，但甘特图任务保留）
- **sync_gantt_to_kanban**：从甘特图侧同步任务属性到关联的卡片（名称、日期等）

`kanban_cards.gantt_task_id` 是关联的外键，Rust 模型中为 `Option<i64>`。

## AppSettings 扩展模式

`AppSettings` Rust 模型使用 `#[serde(flatten)]` + `HashMap<String, String>` 扩展字段，这意味着除了固定的 `theme` 和 `language` 外，`settings` 表可以存储任意键值对（如 `share_connections`、`notification_history`、`notification_preferences`、`folder_template`、`default_project_path` 等），前端 TypeScript 类型同样允许额外字段。

## CSS 变量命名约定

组件中使用复合 CSS 变量名（如 `--text-primary`、`--text-secondary`、`--bg-void`、`--bg-surface-alt`、`--gold-glow`、`--border-light`），这些是对品牌设计系统 Token 的扩展变体。基础 Token 名（如 `--text`、`--bg`、`--accent`）在全局 CSS 中定义，组件中的变体名在各自的样式或 Layout 中定义。

## 品牌设计系统

品牌规范来源：`D:\Users\202536786\Desktop\品牌设计.html`。所有 UI 变更必须遵循该规范。

### 品牌名

**飞序 · Fileosophy** — "在有序的体系中迸发思想的自由"

### Logo

SVG 图形标识：文档轮廓（圆角矩形 + 折角）+ 三行文字线 + 流动曲线（贝塞尔）+ 终点圆点。
- viewBox: `0 0 120 120`
- 暗色模式：描边 `#f3efe7`，曲线 `#c49b51`
- 亮色模式：描边 `#1e1a14`，曲线 `#9b7428`

### 色彩体系（CSS 自定义属性）

| Token | 暗色模式 | 亮色模式 | 命名 |
|-------|---------|---------|------|
| `--bg` | `#16120e` | `#f6f1e6` | 墨渊 / 羊皮纸 |
| `--surface` | `#221d17` | `#eae3d2` | 古卷 |
| `--border` | `#2e2820` | `#d4c9b2` | |
| `--text` | `#f3efe7` | `#1e1a14` | |
| `--text-secondary` | `#b8b2a6` | `#4a4338` | |
| `--text-muted` | `#7a7368` | `#7a7160` | 墨渍 |
| `--accent` | `#c49b51` | `#9b7428` | 鎏金 |

### 字体

- `serif`（Display）：Cormorant Garamond Light — 标题、品牌名
- `mono`（Body）：DM Mono Light — 正文、UI 文字

### 视觉特效

- 噪点纹理：`body::before` 使用 fractalNoise SVG filter，opacity 暗 `0.018` / 亮 `0.012`
- 羊皮纸纹理：`body::after` 使用 repeating-linear-gradient + radial-gradient
- 缓动曲线：`cubic-bezier(0.22, 1, 0.36, 1)`
- 圆角：`md: 12px`，`lg: 20px`
- 阴影：暗 `0 8px 40px rgba(0,0,0,0.55)` / 亮 `0 8px 48px rgba(0,0,0,0.10)`

### Tailwind CSS 配置

暗色模式通过 `class` 策略切换。自定义颜色（`gold-*`、`warm-*`、`parchment-*`、`void-*`、`ink-*`）在 `tailwind.config.js` 中定义，色值必须与上述品牌规范一致。自定义阴影（`gold`、`gold-lg`）和动画（`slide-up`、`scale-in`、`fade-in`）。
