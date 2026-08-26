import { mkdir, readdir, writeFile } from "node:fs/promises";
import { Feed } from "feed";
import {
  absoluteUrls,
  extractArticle,
  fetchDocument,
} from "./utils/parser.mjs";

/** @typedef {import("./source.d.ts").ListItem} ListItem */
/** @typedef {import("./source.d.ts").Source} Source */

const sourceDirectory = new URL("./sources/", import.meta.url);
const sourcePaths = (await readdir(sourceDirectory, { withFileTypes: true }))
  .sort((left, right) => left.name.localeCompare(right.name))
  .flatMap((entry) =>
    entry.isFile() && entry.name.endsWith(".mjs")
      ? [entry.name]
      : entry.isDirectory()
        ? [`${entry.name}/index.mjs`]
        : [],
  );
/** @type {Source[]} */
const sources = (
  await Promise.all(
    sourcePaths.map(
      async (path) =>
        (await import(new URL(path, sourceDirectory).href)).default,
    ),
  )
).flatMap((source) => (Array.isArray(source) ? source : [source]));
const limit = 20;
const feedBaseUrl = process.env.FEED_BASE_URL;
const webSubHub = "https://pubsubhubbub.superfeedr.com/";

/** @param {string | Date | undefined} value */
function validDate(value) {
  const date = value && new Date(value);
  return date && !Number.isNaN(date.valueOf()) ? date : undefined;
}

/** @param {ListItem} item @returns {item is ListItem & { link: string, title: string }} */
function hasLinkAndTitle(item) {
  return Boolean(item.link && item.title);
}

/** @param {Source} source */
async function generate(source) {
  const feedUrl =
    feedBaseUrl && new URL(`${source.id}.xml`, `${feedBaseUrl}/`).href;
  const feed = new Feed({
    title: source.title,
    description: source.description,
    id: source.link,
    link: source.link,
    ...(feedUrl && { feed: feedUrl, hub: webSubHub }),
    copyright: "",
    language: "zh-CN",
    updated: new Date(),
  });

  try {
    const document = source.fetchItems
      ? await source.fetchItems()
      : await fetchDocument(source.link, source.encoding);
    const seen = new Set();
    const listed = (
      source.extractItems
        ? source.extractItems(/** @type {Document} */ (document))
        : /** @type {ListItem[]} */ (document)
    )
      .map((item) => ({
        ...item,
        link: item.link && new URL(item.link, source.link).href,
        articleUrl:
          item.articleUrl && new URL(item.articleUrl, source.link).href,
      }))
      .filter(hasLinkAndTitle)
      .filter((item) => !seen.has(item.link) && seen.add(item.link))
      .slice(0, limit);

    const results = await Promise.allSettled(
      listed.map(async (item) => {
        if (!item.link || !item.title)
          throw new Error("missing item link or title");
        if (item.content !== undefined)
          return {
            item,
            article: {
              ...item,
              content: absoluteUrls(item.content, item.link),
            },
          };
        const url = item.articleUrl || item.link;
        const document = await fetchDocument(url, source.encoding);
        return { item, article: await extractArticle(document, url, source) };
      }),
    );
    for (const result of results) {
      if (result.status !== "fulfilled" || !result.value.article) {
        if (result.status === "rejected")
          console.warn(
            `[${source.id}] skipped article:`,
            result.reason.message,
          );
        continue;
      }
      const { item, article } = result.value;
      if (!item.link || !item.title) continue;
      const date = validDate(article.date || item.date) || new Date();
      feed.addItem({
        title: article.title || item.title,
        id: item.link,
        link: item.link,
        content: article.content,
        date,
      });
    }
  } catch (error) {
    console.warn(
      `[${source.id}] skipped source:`,
      error instanceof Error ? error.message : String(error),
    );
  }

  await writeFile(`public/${source.id}.xml`, feed.rss2());
}

await mkdir("public", { recursive: true });
const results = await Promise.allSettled(sources.map(generate));
for (const result of results) {
  if (result.status === "rejected")
    console.warn("Failed to write feed:", result.reason.message);
}
await writeFile(
  "public/index.html",
  `<!doctype html><meta charset="utf-8"><title>RSS feeds</title><ul>${sources.map((source) => `<li><a href="${source.id}.xml">${source.title}</a></li>`).join("")}</ul>`,
);
await writeFile(
  "public/websub-feeds.txt",
  sources.map((source) => `${source.id}.xml`).join("\n"),
);
