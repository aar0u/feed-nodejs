import { parseHTML } from "linkedom";

const baseUrl = "https://xueqiu.com";
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
let cookiePromise;

/** @typedef {{ filename?: string }} Image */
/** @typedef {{ id: string | number, target: string, title?: string, text?: string, description?: string, retweeted_status?: Status, image_info_list?: Image[], created_at?: string | number, legal_user_visible?: boolean, mark?: number }} Status */

async function getCookies() {
  return (cookiePromise ??= (async () => {
    for (const path of ["/about", "/hq"]) {
      try {
        const response = await fetch(new URL(path, baseUrl), {
          headers: { "User-Agent": userAgent },
          redirect: "follow",
        });
        const cookies = response.headers
          .getSetCookie()
          .map((cookie) => cookie.split(";")[0])
          .join("; ");
        if (cookies.includes("xq_a_token")) {
          return cookies;
        }
      } catch {}
    }
    throw new Error("Failed to obtain Xueqiu session cookies");
  })().catch((error) => {
    cookiePromise = undefined;
    throw error;
  }));
}

/** @param {string | URL} url */
async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      cookie: await getCookies(),
      referer: baseUrl,
      "User-Agent": userAgent,
    },
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
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
    filename ? [`<img src="https://xqimg.imedao.com/${filename}">`] : [],
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

/** @param {Status} status */
async function timelineItem(status) {
  if (status.legal_user_visible) return item(status);

  try {
    const detail = await getJson(
      `https://api.xueqiu.com/statuses/show.json?id=${status.id}`,
    );
    return item({ ...status, ...detail });
  } catch {
    return item(status);
  }
}

/** @param {string} userId */
export async function userTimeline(userId) {
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
  const statuses = (await getJson(url)).statuses;
  const visible = statuses.filter((status) => status.mark !== 1);
  const items = [];
  for (let index = 0; index < visible.length; index += 3) {
    items.push(
      ...(await Promise.all(visible.slice(index, index + 3).map(timelineItem))),
    );
  }
  return items;
}

export async function hotPosts() {
  const url = new URL("/statuses/hot/listV2.json", "https://api.xueqiu.com");
  url.search = new URLSearchParams({
    since_id: "-1",
    max_id: "-1",
    size: "15",
  }).toString();
  const data = await getJson(url);
  /** @type {Status[]} */
  const statuses = (data.items || [])
    .map(
      (/** @type {{ original_status?: Status }} */ entry) =>
        entry.original_status,
    )
    .filter(Boolean);
  return statuses.map(item);
}
