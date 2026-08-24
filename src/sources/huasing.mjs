import { parseHTML } from "linkedom";
import { fetchDocument } from "../utils/parser.mjs";

const baseUrl = "http://bbs.huasing.org";

function decode(value = "") {
  const html = value
    .replace(/\\'/g, "'")
    .replace(/\\n/g, "\n")
    .replace(/\\u3000/g, "　")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return parseHTML(`<span>${html}</span>`).document.querySelector("span").textContent;
}

function text(value) {
  return decode(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/　　/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

async function imagesByPost(boardAndThread) {
  const firstPage = `${baseUrl}/wap/xbbs.php?B=${boardAndThread}`;
  const pages = [firstPage];
  const visited = new Set();
  const images = new Map();

  while (pages.length) {
    const pageUrl = pages.pop();
    if (visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    let document;
    try {
      document = await fetchDocument(pageUrl, "gbk");
    } catch {
      continue;
    }

    for (const article of document.querySelectorAll(".article p")) {
      const postId = article.querySelector('a[href*="/sForum/bbs.php?B="]')?.getAttribute("href")?.match(/B=\d+_(\d+)/)?.[1];
      if (!postId) continue;
      images.set(postId, [...article.querySelectorAll("img[src]")].map((image) => new URL(image.getAttribute("src"), pageUrl).href));
    }

    for (const link of document.querySelectorAll("#page a[href]")) {
      const page = new URL(link.getAttribute("href"), pageUrl).href;
      if (page.startsWith(`${baseUrl}/wap/xbbs.php?`) && !visited.has(page)) pages.push(page);
    }
  }

  return images;
}

/** @type {import("../source.d.ts").Source} */
const source = {
  id: "huasing",
  title: "华新鲜事",
  link: `${baseUrl}/sForum/zsbbs.php`,
  description: "华新论坛最新帖子",
  encoding: "gbk",
  async extract(document, url) {
    const boardAndThread = new URL(url).searchParams.get("B");
    const boardId = boardAndThread?.split("_")[0];
    const scripts = [...document.querySelectorAll("script")].map((node) => node.textContent).join("\n");
    const bodies = new Map([...scripts.matchAll(/zc\((\d+),'((?:\\.|[^'])*)'\);/gs)].map(([, id, body]) => [id, body]));
    const posts = [...scripts.matchAll(/zt\(\d+,(\d+),\d+,(\d+),'(.*?)',(\d+),'(.*?)'/gs)]
      .map(([, id, timestamp, title, userId, author]) => ({ id, title, userId, author, date: new Date(Number(timestamp) * 1000) }))
      .sort((left, right) => left.date.valueOf() - right.date.valueOf());
    if (!posts.length) return null;
    const images = boardAndThread ? await imagesByPost(boardAndThread) : new Map();

    return {
      title: decode(posts[0].title),
      date: posts.at(-1).date,
      content: posts.map((post) => {
        const link = boardId && `${baseUrl}/wap/xbbs.php?B=${boardId}_${post.id}`;
        const body = bodies.has(post.id) ? text(bodies.get(post.id)).replace("(more...)", link ? `(<a href="${link}">more...</a>)` : "(more...)") : "";
        const media = images.get(post.id)?.map((image) => `<img src="${image}">`).join("") || "";
        return `<article><h3>${text(post.title)}</h3>${body && `<p>${body}</p>`}${media}<p><small><a href="${baseUrl}/sForum/user.php?B=${post.userId}">${text(post.author)}</a> · ${post.date.toUTCString()}</small></p></article>`;
      }).join(""),
    };
  },
  extractItems(document) {
    return [...document.querySelectorAll('[id^="s-"]')]
      .map((item) => {
        const id = item.id.slice(2);
        const separator = id.indexOf("-");
        const boardAndThread = separator === -1 ? "" : id.replace("-", "_");
        const title = item.textContent.trim();
        return {
          link: boardAndThread ? `${baseUrl}/wap/xbbs.php?B=${boardAndThread}` : "",
          articleUrl: boardAndThread ? `${baseUrl}/sForum/ztree.php?B=${boardAndThread}` : "",
          title,
        };
      })
      .filter((item) => item.title && !item.title.includes("[置顶]"));
  },
};

export default source;
