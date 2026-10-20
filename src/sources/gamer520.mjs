import { extractContent, fetchDocument } from "../utils/parser.mjs";

const baseUrl = "https://www.gamer520.com";

/** @param {string} target @param {string} [endpoint] */
export function proxyUrl(
  target,
  endpoint = process.env.GAMER520_PROXY_URL ||
    "https://assets.spotjoy.com/fetch",
) {
  const upstream = new URL(target, baseUrl);
  if (upstream.origin !== baseUrl || upstream.username || upstream.password)
    throw new Error("Proxy target is outside Gamer520");
  const proxy = new URL(endpoint);
  if (proxy.protocol !== "https:" || proxy.username || proxy.password)
    throw new Error("Proxy endpoint must be HTTPS without credentials");
  proxy.searchParams.set("url", upstream.href);
  return proxy;
}

/** @param {Document} document */
export function extractItems(document) {
  return [...document.querySelectorAll(".posts-wrapper article")].map(
    (article) => ({
      link:
        article.querySelector(".entry-title a")?.getAttribute("href") ??
        undefined,
      title: article.querySelector(".entry-title")?.textContent.trim(),
      date:
        article.querySelector("time[datetime]")?.getAttribute("datetime") ??
        undefined,
    }),
  );
}

/** @type {import("../source.d.ts").Source} */
const source = {
  id: "gamer520-gameswitch",
  title: "Switch游戏下载",
  link: `${baseUrl}/gameswitch`,
  description: "Gamer520 Switch 游戏下载更新",
  requestDelay: 2_000,
  contentFetchConcurrency: 1,
  async fetchItems(signal) {
    const document = await fetchDocument(
      proxyUrl(source.link),
      undefined,
      signal,
    );
    const items = extractItems(document);
    if (!items.length)
      throw new Error("Proxy response contains no game articles");
    return items;
  },
  async fetchContent(candidate, signal) {
    const url = candidate.contentUrl || candidate.link;
    if (!url) throw new Error("Missing Gamer520 article URL");
    const document = await fetchDocument(proxyUrl(url), undefined, signal);
    if (!document.querySelector(".entry-content")?.innerHTML.trim())
      throw new Error("Proxy article response has no entry content");
    return extractContent(document, url, source, signal);
  },
  extract(document) {
    const content = document.querySelector(".entry-content")?.innerHTML;
    return content?.trim() ? { content } : null;
  },
};

export default source;
