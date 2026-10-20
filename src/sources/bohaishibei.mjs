const feedUrl = "https://feed.luobo8.com/";
const siteUrl = "https://www.bohaishibei.com/";

/** @param {string} item @param {string} tag */
function field(item, tag) {
  return item
    .match(
      new RegExp(
        `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
      ),
    )?.[1]
    ?.trim();
}

/** @param {string} content */
function proxyImages(content) {
  return content.replace(
    /(<img\b[^>]*\bsrc=["'])https:\/\/(img|assets)\.bohaishibei\.com(?=\/)/gi,
    "$1https://$2.spotjoy.com",
  );
}

/** @param {AbortSignal} [signal] @returns {Promise<import("../source.d.ts").FeedEntryCandidate[]>} */
async function fetchItems(signal) {
  const response = await fetch(feedUrl, {
    signal: AbortSignal.any([
      AbortSignal.timeout(10_000),
      ...(signal ? [signal] : []),
    ]),
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);

  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap(([, item]) => {
    const title = field(item, "title");
    const link = field(item, "link");
    const content = field(item, "content:encoded");
    if (!title || !link || !content) return [];
    return [
      {
        title,
        link,
        content: proxyImages(content),
        date: field(item, "pubDate"),
      },
    ];
  });
}

/** @type {import("../source.d.ts").Source} */
export default {
  id: "bohaishibei",
  title: "博海拾贝",
  description: "博海拾贝最新文章",
  link: siteUrl,
  fetchItems,
};
