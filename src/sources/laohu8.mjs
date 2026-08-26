import { parseHTML } from "linkedom";

const newsUrl = "https://www.laohu8.com/news";
const quoteUrl =
  "https://hq.laohu8.com/stock_info/detail/all?lang=zh_CN&lang_content=all&region=SGP&appVer=4.44.1&appName=laohu8&vendor=web&platform=web&edition=full";

/** @typedef {{ nameCN?: string, changeRate?: number, hourTrading?: { tag?: string } }} Quote */
/** @typedef {{ id: string | number, url: string, title: string, pubTimestamp: number, symbols?: string[], symbols_score_info?: Record<string, number> }} NewsItem */
/** @typedef {{ items: NewsItem[], token: string }} News */

/** @param {unknown} value */
function escape(value) {
  /** @type {Record<string, string>} */
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

/** @param {string} symbol @param {Quote | undefined} quote */
function symbolLink(symbol, quote) {
  return `<a href="https://www.laohu8.com/stock/${encodeURIComponent(symbol)}">${escape(quote?.nameCN || symbol)} (${escape(symbol)})</a>`;
}

/** @param {Quote | undefined} quote */
function quoteSummary(quote) {
  if (typeof quote?.changeRate !== "number") return "";
  const change = `${quote.changeRate >= 0 ? "+" : ""}${(quote.changeRate * 100).toFixed(2)}%`;
  return ` <small>${change}${quote.hourTrading?.tag ? ` · ${escape(quote.hourTrading.tag)}` : ""}</small>`;
}

/** @returns {Promise<News>} */
async function getNews() {
  const response = await fetch(newsUrl, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  const html = await response.text();
  const rawData = html.match(
    /<textarea[^>]*id="__APP_DATA__"[^>]*>([\s\S]*?)<\/textarea>/,
  )?.[1];
  const token = html.match(/guestUser:\s*(\{.*?\}),\s*trackPageInfo/s)?.[1];
  if (!rawData || !token) throw new Error("missing news data");
  const decoded = parseHTML(
    `<html><body><div>${rawData}</div></body></html>`,
  ).document.querySelector("div")?.textContent;
  if (!decoded) throw new Error("missing news data");
  return {
    items: JSON.parse(decoded).data.topNews.listData,
    token: JSON.parse(token).access_token,
  };
}

/** @param {string[]} symbols @param {string} token @returns {Promise<Map<string, Quote>>} */
async function quotes(symbols, token) {
  if (!symbols.length) return new Map();
  const response = await fetch(quoteUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      usDelay: true,
      hkDelay: true,
      items: symbols.map((symbol) => ({ symbol })),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return new Map(
    (await response.json()).items.map(
      /** @param {Quote & { symbol: string }} quote */ (quote) => [
        quote.symbol,
        quote,
      ],
    ),
  );
}

/** @param {NewsItem} item @param {Map<string, Quote>} quotes */
async function article(item, quotes) {
  const response = await fetch(item.url, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  const content = parseHTML(await response.text()).document.querySelector(
    "article",
  )?.innerHTML;
  if (!content) throw new Error("missing article content");
  const symbols = item.symbols || [];
  const primary = [...symbols].sort(
    (left, right) =>
      (item.symbols_score_info?.[right] || 0) -
      (item.symbols_score_info?.[left] || 0),
  )[0];
  const related = symbols
    .map((symbol) => symbolLink(symbol, quotes.get(symbol)))
    .join(" · ");
  const primaryContent =
    primary &&
    `<p><strong>相关标的：</strong>${symbolLink(primary, quotes.get(primary))}${quoteSummary(quotes.get(primary))}</p>`;
  const fullList =
    symbols.length > 1 &&
    `<hr><p><small><strong>全部相关标的：</strong>${related}</small></p>`;
  return {
    link: `https://www.laohu8.com/news/${item.id}`,
    title: item.title,
    date: new Date(item.pubTimestamp * 1000),
    content: `${primaryContent || ""}${content}${fullList || ""}`,
  };
}

async function news() {
  const { items, token } = await getNews();
  const symbols = [...new Set(items.flatMap((item) => item.symbols || []))];
  const details = await quotes(symbols, token).catch(() => new Map());
  const articles = [];
  for (const item of items) {
    articles.push(await article(item, details));
    if (articles.length < items.length)
      await new Promise((resolve) => setTimeout(resolve, source.requestDelay));
  }
  return articles;
}

/** @type {import("../source.d.ts").Source} */
const source = {
  id: "laohu8-news",
  title: "老虎社区 · 要闻",
  link: newsUrl,
  description: "老虎社区热门资讯",
  requestDelay: 500,
  fetchItems: news,
};

export default source;
