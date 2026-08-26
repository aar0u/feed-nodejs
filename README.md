# Static Full-text RSS

使用 Node.js 定时抓取文章，优先由 `@mozilla/readability` 提取全文。生成的 XML 发布到 `gh-pages` branch，并以已发布 RSS 作为增量更新状态。

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

要添加单一来源，只需在 `src/sources/` 新增一个 `.mjs` source 模块；入口也会加载一级子目录的 `index.mjs`，后者可默认导出多个相关来源。普通来源的 `extractItems(document)` 返回 `{ link, title, date?, contentUrl? }`；仅在通用 Readability 不够时加入 `extract`。需要其他传输方式的来源可定义 `fetchItems()`，直接返回含 `content` 的条目。抓取内容的 URL 不同于条目 URL 时，返回 `contentUrl`。缺少有效日期时不生成 `pubDate`。

## GitHub Pages

1. 推送此项目到 GitHub。
2. 在仓库 **Settings → Pages → Build and deployment** 选择 **Deploy from a branch**，branch 选 `gh-pages`、目录选 `/(root)`。
3. 由 Cloudflare Worker 触发 `Generate Static`，也可在 **Actions** 手动运行。

工作流从 `gh-pages` 读取上次发布的 XML，只在有新增文章、评论或回帖时发布；每个 feed 保留最近 100 个事件，`gh-pages` 只保留最近 5 个 commit。部署后可从 Pages URL 访问 `/index.html`。
