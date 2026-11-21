# Project Context: 私人轻小说文库网站 (Light Novel Library)

## 1. 项目简介与核心目标
本项目是一个前后端分离的私人云端轻小说书架与阅读器。
- **核心流程**：用户上传本地 `.epub` 轻小说 -> 后端异步解析元数据、章节与插画 -> 首页以**横向堆叠书脊**的形式展示个人书架 -> 点击进入沉浸式阅读器。
- **开发策略**：采用**渐进式 MVP 开发**。第一阶段（Phase 1）先实现单机无登录闭环（上传、解析、横向书架、基础阅读）；第二阶段再接入用户系统（JWT）、进度同步、插画画廊与动效打磨。

---

## 2. 技术栈锁定（严禁擅自更换核心框架）

### 后端 (Backend)
- **语言与框架**：Python 3.11+ / FastAPI
- **数据库与 ORM**：SQLite（初期开发）/ SQLAlchemy 2.0（统一使用异步写法 `AsyncSession` + `aiosqlite`）
- **数据校验**：Pydantic v2
- **EPUB 解析与图像处理**：`ebooklib`、`beautifulsoup4`、`lxml`、`Pillow`（用于提取封面主色调作为书脊颜色）
- **文件存储**：本地静态目录 `backend/storage/`，通过 FastAPI `StaticFiles` 挂载为 `/static` 访问

### 前端 (Frontend)
- **核心框架**：React 18+ (TypeScript)
- **构建工具**：Vite
- **样式方案**：Tailwind CSS（优先使用 Tailwind 原子类，避免编写冗长的独立 CSS 文件）
- **网络请求**：Axios（统一封装在 `src/api/` 目录下）
- **路由**：React Router v6

---

## 3. 标准目录结构

```text
light-novel-web/
├── PROJECT_CONTEXT.md        # 本项目上下文规范
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI 入口、CORS 配置、StaticFiles 挂载
│   │   ├── core/             # 配置文件 (config.py)、数据库连接 (database.py)
│   │   ├── models/           # SQLAlchemy 2.0 数据库模型
│   │   ├── schemas/          # Pydantic 请求/响应模型
│   │   ├── api/v1/           # 路由模块 (books.py, chapters.py, auth.py)
│   │   └── services/         # 核心业务逻辑 (epub_parser.py)
│   ├── storage/              # 存放上传的 EPUB、提取的封面与插画（加入 .gitignore）
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── api/              # Axios 实例与后端接口封装
    │   ├── components/       # 可复用组件 (如 BookSpine.tsx / BookShelf.tsx)
    │   ├── pages/            # 页面视图 (HomeShelf, ReaderView)
    │   └── App.tsx / App.vue
    └── package.json