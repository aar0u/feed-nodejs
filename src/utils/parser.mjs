import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

const timeout = 10_000;
const headers = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
};

/** @param {string | URL} url @param {string} [encoding] */
export async function fetchDocument(url, encoding = "utf-8") {
  const cookies = new Map();

  for (let redirects = 0; redirects < 6; redirects += 1) {
    const cookie = [...cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
    const response = await fetch(url, {
      headers: cookie ? { ...headers, cookie } : headers,
      redirect: "manual",
      signal: AbortSignal.timeout(timeout),
    });
    const setCookies =
      response.headers.getSetCookie?.() ||
      [response.headers.get("set-cookie")].filter(Boolean);
    for (const value of setCookies) {
      const [name, cookieValue] = value.split(";", 1)[0].split("=");
      cookies.set(name, cookieValue);
    }

    const location = response.headers.get("location");
    if (location && response.status >= 300 && response.status < 400) {
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok)
      throw new Error(`${response.status} ${response.statusText}`);

    const charset =
      response.headers.get("content-type")?.match(/charset=([^;\s]+)/i)?.[1] ||
      encoding;
    return parseHTML(
      new TextDecoder(charset).decode(await response.arrayBuffer()),
    ).document;
  }

  throw new Error("too many redirects");
}

/** @param {string} html @param {string | URL} url */
export function absoluteUrls(html, url) {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  for (const node of document.querySelectorAll("[href], [src]")) {
    for (const attribute of ["href", "src"]) {
      const value = node.getAttribute(attribute);
      if (value) node.setAttribute(attribute, new URL(value, url).href);
    }
  }
  return document.body.innerHTML;
}

/** @param {Document} document @param {string} url @param {import("../source.d.ts").Source} [source] */
export async function extractArticle(document, url, source) {
  const published =
    document
      .querySelector('meta[property="article:published_time"], time[datetime]')
      ?.getAttribute("content") ||
    document.querySelector("time[datetime]")?.getAttribute("datetime");
  const custom = await source?.extract?.(document, url);
  if (custom)
    return {
      ...custom,
      content: absoluteUrls(custom.content, url),
      date: custom.date || (published ? new Date(published) : undefined),
    };

  const article = new Readability(document).parse();
  const content = article?.content;
  if (!content?.trim()) return null;

  return {
    title: article?.title?.trim(),
    content: absoluteUrls(content, url),
    date: published ? new Date(published) : undefined,
  };
}
