# devclean

**你的开发机正在囤积几十 GB 垃圾。找出它们，看清它们，收回来。**

[English](README.md) | 简体中文

`devclean` 扫描开发工具悄悄留下的每一类缓存 —— npm、pnpm、pip、Cargo、Gradle、Playwright 浏览器、Hugging Face 模型、本地大模型权重 —— 并告诉哪些可以安全删除。一条命令，零配置，零遥测。

![devclean 扫描并回收 1.4 GB 开发缓存](docs/demo.png)

```bash
npx devclean              # 扫描已知缓存
npx devclean clean        # 删除低/中风险缓存（先确认）
npx devclean projects .   # 找出项目里的 node_modules / .venv / target
```

## 为什么

每个包管理器都会留缓存，每个 AI 工具都会下载模型权重，每个项目都会长出 `node_modules`。单看都不起眼，加起来轻松吃掉 20-100 GB —— 而且没有一个工具能同时看到它们。

现有清理工具要么只认 `node_modules`，要么把你辛苦下的模型权重当成垃圾。`devclean` 分得清。

## 扫描范围

| 缓存 | 风险 | 说明 |
| --- | --- | --- |
| npm / pnpm / Yarn / Bun | 低 | 包体缓存，需要时重新下载 |
| pip / uv | 低 | Python wheel 与 HTTP 缓存 |
| Cargo / Go build | 低 | 依赖与编译缓存 |
| Gradle / Maven | 低 / 中 | 依赖仓库 |
| Playwright / Puppeteer | 低 | 浏览器二进制 |
| Hugging Face | 中 | 模型与数据集下载 |
| Ollama / LM Studio | **高** | 本地大模型权重，删了要重新拉取 |

`clean` 默认跳过高风险缓存，除非加 `--all`。删除前一定先列出清单和总量。

## 安全

- **先预览**：`--dry-run` 只打印计划，不删任何东西。
- **风险分级**：高风险项（本地模型权重）默认不删。
- **白名单**：不是已知缓存或项目产物的路径，一律拒删。
- **无网络、无遥测**：全部本地完成。
- **失败会报告**：Windows 文件被占用时逐条列出错误，不静默跳过。

## 脚本化

```bash
npx devclean --json | jq '.totalBytes'
npx devclean clean --json --yes   # 只删低/中风险
```

## 开发

```bash
git clone https://github.com/shisilang684/devclean
cd devclean
npm install && npm run build && npm test
node dist/cli.js
```

零运行时依赖，TypeScript + Node 内置测试。

## 许可证

MIT
