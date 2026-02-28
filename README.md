# Yuque Crawler (语雀知识库爬虫)

这是一个基于 Node.js + Puppeteer 的语雀知识库爬虫工具。它可以将整个语雀知识库（Knowledge Base）导出为本地的 Markdown 文件，同时保持原有的目录结构，并自动下载文档中的图片到腾讯云COS。

> 本项目基于 [大佬](https://github.com/xiyueyezibile/yuque-copy)项目基础上开发支持图片上传腾讯云。原因：发现下载的markdown文档中的图片无法正常导入飞书，最后发现自己有腾讯云对象存储，飞书也支持图片链接导入，就基于大模型在原有项目上进行了二次开发。

## ✨ 功能特性

- **📚 全量导出**：自动识别知识库目录结构，递归爬取所有文档。
- **� 高速并发**：支持多线程并发下载，下载速度飞快。
- **�📝 Markdown 源码**：直接获取语雀的 Markdown 源码，保留最佳格式。
- **🖼️ 图片本地化**：自动下载文档中的图片到本地 `images` 目录，并修正 Markdown 中的引用路径。
- **📂 目录还原**：完美还原知识库的层级结构（文件夹/文档），智能跳过空目录节点。
- **📊 进度展示**：提供美观的 CLI 进度条，实时展示下载进度。
- **🛡️ 稳定可靠**：内置重试机制、随机延迟和 Cookie 注入，降低被反爬的风险。
- **📑 GitBook 兼容**：自动生成 `SUMMARY.md`，可直接用于 GitBook 构建。

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/tedburner/yuque-exporter.git
cd yuque-exporter
```

### 2. 安装依赖

```bash
npm install
```

### 3. 项目配置

**重要：** 本项目依赖 `src/config.js` 进行运行，该文件包含敏感信息（如 Cookie），因此未包含在 Git 仓库中。

1.  **生成配置文件**：
    将提供的配置模板 `src/config.example.js` 复制一份并重命名为 `src/config.js`：
    ```bash
    cp src/config.example.js src/config.js
    ```

2.  **编辑配置**：
    打开 `src/config.js`，填入你的配置：
    *   `targetUrl`: 目标知识库的首页 URL（例如 `https://www.yuque.com/your-space/your-book`）。
    *   `cookie`: 你的语雀 Cookie (必须提供，否则无法访问)。
        *   **如何获取**：在浏览器登录语雀，按 `F12` 打开开发者工具 -> `Network` -> 刷新页面 -> 点击任意请求 -> 在 `Request Headers` 中找到 `Cookie` 并复制。

```javascript
// src/config.js
module.exports = {
    // ...
    cookie: '你的_cookie_字符串_在这里', 
    // ...
};
```

> ⚠️ **注意**：`src/config.js` 包含敏感信息，已被加入 `.gitignore`，请勿提交到版本控制系统。

### 4. 运行爬虫

```bash
node index.js
```

运行完成后，你可以在 `download/` 目录下找到下载好的知识库。

## 📁 项目结构

```text
.
├── download/              # [自动生成] 下载输出目录
├── src/
│   ├── config.example.js  # 配置模板
│   ├── config.js          # [需创建] 实际配置文件 (Git 忽略)
│   ├── crawler.js         # 爬虫核心逻辑
│   └── utils.js           # 工具函数
├── article.md             # [教程] 开发过程复盘文章
├── index.js               # 程序入口
├── package.json
└── README.md
```

## 🛠️ 高级配置

你可以在 `src/config.js` 中调整更多参数：

```javascript
module.exports = {
    // ...
    timeout: 15000,           // 请求超时时间 (ms)
    retry: 3,                 // 失败重试次数
    sleepBetweenRetry: 2000,  // 重试间隔 (ms)
    concurrency: 5,           // 并发下载数 (建议 5-10，过高可能触发风控)
    windowSize: '1920,1080',  // 浏览器窗口大小
    // ...
};
```


## ⚠️ 免责声明

本项目仅供学习和个人数据备份使用。请勿用于抓取他人的私有数据或用于商业用途。使用本工具产生的任何后果由使用者自行承担。请遵守语雀的服务条款。
