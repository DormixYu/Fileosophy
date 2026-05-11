<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/DormixYu/Fileosophy/main/assets/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/DormixYu/Fileosophy/main/assets/logo-light.svg">
    <img alt="飞序 · Fileosophy" src="https://raw.githubusercontent.com/DormixYu/Fileosophy/main/assets/logo-dark.svg" width="140">
  </picture>
</p>

<h3 align="center" style="font-weight:300; letter-spacing:0.4em; color:#b8b2a6; margin-top:20px;">在有序的体系中迸发思想的自由</h3>

<p align="center" style="color:#7a7368; font-size:13px; margin-top:12px;">
  一款精致、轻盈的桌面项目管理工具 — 看板 · 甘特图 · 文件共享 · 局域网协作
</p>

---

## 功能

- **看板** — 拖拽式卡片管理，列间自由流转，标签分类
- **甘特图** — 时间线视图，任务依赖，进度追踪
- **文件管理** — 本地上传与文件夹树浏览双模式，文本/图片/Markdown 即时预览
- **局域网协作** — mDNS 自动发现同局域网实例，TCP 文件直传，无需中转服务器
- **通知系统** — Toast 弹窗 + 历史记录 + 系统原生通知三层架构
- **全局搜索** — `Ctrl+Shift+F` 跨项目检索
- **深色/浅色** — 羊皮纸质感双主题，品牌鎏金点缀

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Tauri 2.x |
| 前端 | React 18 + TypeScript + Vite |
| 样式 | Tailwind CSS |
| 状态管理 | Zustand |
| 拖拽 | @dnd-kit/core |
| 后端 | Rust 2021 edition |
| 数据库 | SQLite (rusqlite bundled) |
| 网络发现 | mDNS (mdns-sd crate) |
| 文件传输 | TCP 直连 (4 字节长度前缀 + JSON header) |

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/) ≥ 1.70

### 开发

```bash
# 克隆仓库
git clone git@github.com:DormixYu/Fileosophy.git
cd Fileosophy

# 安装前端依赖
npm install

# 仅启动前端 (端口 1420)
npm run dev

# 启动完整 Tauri 桌面应用
npm run tauri dev

# 前端类型检查
npx tsc --noEmit

# Rust 编译检查
cd src-tauri && cargo build

# Rust 测试
cd src-tauri && cargo test
```

### 生产构建

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`。

### 数据库

应用首次启动时自动在 `$APPDATA/fileosophy.db` 创建 SQLite 数据库，无需手动配置。

## 项目结构

```
fileosophy/
├── src/                        # 前端 (React + TypeScript)
│   ├── components/             # UI 组件
│   │   ├── kanban/             #   看板 (Board / Column / Card)
│   │   ├── gantt/              #   甘特图
│   │   ├── files/              #   文件管理 & 预览
│   │   ├── notifications/      #   通知中心 & Toast
│   │   └── common/             #   通用组件 (Modal / Search / Dropdown)
│   ├── stores/                 # Zustand 状态管理
│   ├── lib/tauri-api.ts        # IPC 调用封装 (唯一 invoke 入口)
│   ├── types/index.ts          # TypeScript 类型定义
│   └── pages/                  # 页面组件
├── src-tauri/                  # 后端 (Rust)
│   ├── src/
│   │   ├── commands/           #   Tauri IPC 命令 (按领域拆分)
│   │   ├── db/                 #   数据库连接 & 迁移 & 模型
│   │   ├── events/             #   事件系统
│   │   ├── mdns/               #   mDNS 局域网发现
│   │   ├── sharing/            #   TCP 文件传输
│   │   ├── main.rs             #   入口
│   │   └── lib.rs              #   应用启动 & 插件注册
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
├── tailwind.config.js
└── vite.config.ts
```

## 设计理念

飞序的品牌标识将**文档的秩序结构**与一道**流动的思绪曲线**融为一体——飞鸟般的笔触划过严谨的文件轮廓，寓意在有序的体系中迸发思想的自由。

```
墨渊  #16120E    羊皮纸 #F6F1E6    鎏金 #C49B51    墨渍 #7A7368
```

## 协议

MIT License

---

<p align="center" style="color:#4a4540; font-size:11px; letter-spacing:0.2em;">
  飞序 · Fileosophy — 秩序的哲学
</p>
