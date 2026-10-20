import { parseHTML } from "linkedom";
import { log } from "../../utils/log.mjs";

const baseUrl = "https://xueqiu.com";
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/** @typedef {{ filename?: string }} Image */
/** @typedef {{ id: string | number, target: string, title?: string, text?: string, description?: string, retweeted_status?: Status, image_info_list?: Image[], created_at?: string | number, legal_user_visible?: boolean, mark?: number }} Status */

/** @param {AbortSignal} [signal] */
async function getCookies(signal) {
  for (const path of ["/about", "/hq"]) {
    try {
      const response = await fetch(new URL(path, baseUrl), {
        headers: { "User-Agent": userAgent },
        redirect: "follow",
        signal: AbortSignal.any([
          AbortSignal.timeout(10_000),
          ...(signal ? [signal] : []),
        ]),
      });
      const cookies = response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; ");
      if (cookies.includes("xq_a_token")) {
        return cookies;
      }
    } catch {
      signal?.throwIfAborted();
    }
  }
  throw new Error("Failed to obtain Xueqiu session cookies");
}

/** @param {string | URL} url @param {string} cookie @param {AbortSignal} [signal] */
async function getJson(url, cookie, signal) {
  const response = await fetch(url, {
    headers: {
      cookie,
      referer: baseUrl,
      "User-Agent": userAgent,
    },
    signal: AbortSignal.any([
      AbortSignal.timeout(10_000),
      ...(signal ? [signal] : []),
    ]),
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  const data = await response.json();
  if (data.error_code) throw new Error(`Xueqiu API error ${data.error_code}`);
  return data;
}

/** @param {string} [html] */
function text(html = "") {
  return parseHTML(
    `<html><body>${html}</body></html>`,
  ).document.body.textContent.trim();
}

/** @param {Status} status @param {string} content */
function title(status, content) {
  const characters = [
    ...(text(status.title || status.retweeted_status?.title || content) ||
      "雪球动态"),
  ];
  return characters.slice(0, 80).join("") + (characters.length > 80 ? "…" : "");
}

/** @param {Status} status */
function item(status) {
  const content = status.text || status.description || "";
  const quoted = status.retweeted_status;
  const quote = quoted && (quoted.text || quoted.description);
  const quoteLink = quoted?.target && new URL(quoted.target, baseUrl).href;
  const images = (status.image_info_list || []).flatMap(({ filename }) =>
    filename && !content.includes(`https://xqimg.imedao.com/${filename}`)
      ? [`<img src="https://xqimg.imedao.com/${filename}">`]
      : [],
  );
  return {
    link: new URL(status.target, baseUrl).href,
    title: title(status, content),
    date: status.created_at ? new Date(status.created_at) : undefined,
    content: [
      content,
      quote &&
        `<blockquote>${quote}${quoteLink ? `<p><a href="${quoteLink}">查看原帖</a></p>` : ""}</blockquote>`,
      ...images,
    ]
      .filter(Boolean)
      .join("<br>"),
  };
}

/** @param {Status} status @param {string} cookie @param {AbortSignal} [signal] @returns {Promise<import("../../source.d.ts").FeedEntryCandidate>} */
async function detailedItem(status, cookie, signal) {
  if (status.legal_user_visible) return item(status);
  try {
    const detail = await getJson(
      `https://api.xueqiu.com/statuses/show.json?id=${status.id}`,
      cookie,
      signal,
    );
    if (!detail.text) throw new Error("missing full text");
    return item({ ...status, ...detail });
  } catch (error) {
    signal?.throwIfAborted();
    log(
      "ERROR",
      `[xueqiu] using list text for ${status.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return item(status);
  }
}

/** @param {Status[]} statuses @param {string} cookie @param {AbortSignal} [signal] */
async function items(statuses, cookie, signal) {
  const results = [];
  for (let index = 0; index < statuses.length; index += 3) {
    signal?.throwIfAborted();
    const batch = statuses.slice(index, index + 3);
    results.push(
      ...(await Promise.all(
        batch.map((status) => detailedItem(status, cookie, signal)),
      )),
    );
  }
  return results;
}

/** @param {string} userId @param {AbortSignal} [signal] */
export async function userTimeline(userId, signal) {
  const cookie = await getCookies(signal);
  const url = new URL(
    "/v4/statuses/user_timeline.json",
    "https://api.xueqiu.com",
  );
  url.search = new URLSearchParams({
    user_id: userId,
    type: "10",
    count: "20",
  }).toString();
  /** @type {Status[]} */
  const statuses = (await getJson(url, cookie, signal)).statuses;
  return items(
    statuses.filter((status) => status.mark !== 1),
    cookie,
    signal,
  );
}

/** @param {AbortSignal} [signal] */
export async function hotPosts(signal) {
  const cookie = await getCookies(signal);
  const url = new URL("/statuses/hot/listV2.json", "https://api.xueqiu.com");
  url.search = new URLSearchParams({
    since_id: "-1",
    max_id: "-1",
    size: "15",
  }).toString();
  const data = await getJson(url, cookie, signal);
  /** @type {Status[]} */
  const statuses = (data.items || [])
    .map(
      (/** @type {{ original_status?: Status }} */ entry) =>
        entry.original_status,
    )
    .filter(Boolean);
  return items(statuses, cookie, signal);
}
