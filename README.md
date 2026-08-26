# Static Full-text RSS

使用 Node.js 定时抓取文章，优先由 `@mozilla/readability` 提取全文，生成静态 XML 后由 GitHub Pages 原生 API 部署。

## 本地运行

需要 Node.js 20.19+（Actions 使用 Node.js 20）：

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm run generate
```

生成的文件位于 `public/`.

## 规则

`src/sources/` 保存每个源的入口和列表提取逻辑。`src/utils/parser.mjs` 负责抓取（10 秒超时）和从已抓取的 DOM 提取文章；入口负责协调两者。文章与源的失败通过 `Promise.allSettled` 隔离，其他 XML 仍会生成。

要添加单一来源，只需在 `src/sources/` 新增一个 `.mjs` source 模块；入口也会加载一级子目录的 `index.mjs`，后者可默认导出多个相关来源。普通来源的 `extractItems(document)` 返回 `{ link, title, date?, articleUrl? }`；仅在通用 Readability 不够时加入 `extract`。需要其他传输方式的来源可定义 `fetchItems()`，直接返回含 `content` 的条目。正文 URL 不同于条目 URL 时，返回 `articleUrl`。缺少有效日期时不生成 `pubDate`。

## GitHub Pages

1. 推送此项目到 GitHub。
2. 在仓库 **Settings → Pages → Build and deployment** 选择 **GitHub Actions**。
3. 由 Cloudflare Worker 触发 `Build and deploy`，也可在 **Actions** 手动运行。

工作流使用 `actions/upload-pages-artifact@v3` 和 `actions/deploy-pages@v4`，不会创建 Git commit 或 `gh-pages` 分支。部署后可从 Pages URL 访问 `/index.html`。
