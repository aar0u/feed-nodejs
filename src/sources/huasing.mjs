import { parseHTML } from "linkedom";
import { fetchDocument } from "../utils/parser.mjs";

const baseUrl = "http://bbs.huasing.org";

/** @param {string} [value] */
function decode(value = "") {
  const html = value
    .replace(/\\'/g, "'")
    .replace(/\\n/g, "\n")
    .replace(/\\u3000/g, "　")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return (
    parseHTML(`<span>${html}</span>`).document.querySelector("span")
      ?.textContent || ""
  );
}

/** @param {string} value */
function text(value) {
  return decode(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/　　/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

/** @param {string} boardAndThread */
async function imagesByComment(boardAndThread) {
  const firstPage = `${baseUrl}/wap/xbbs.php?B=${boardAndThread}`;
  const pages = [firstPage];
  const visited = new Set();
  /** @type {Map<string, string[]>} */
  const images = new Map();

  while (pages.length) {
    const pageUrl = pages.pop();
    if (!pageUrl || visited.has(pageUrl)) continue;
    visited.add(pageUrl);

    let document;
    try {
      document = await fetchDocument(pageUrl, "gbk");
    } catch {
      continue;
    }

    for (const article of document.querySelectorAll(".article p")) {
      const commentId = article
        .querySelector('a[href*="/sForum/bbs.php?B="]')
        ?.getAttribute("href")
        ?.match(/B=\d+_(\d+)/)?.[1];
      if (!commentId) continue;
      images.set(
        commentId,
        [...article.querySelectorAll("img[src]")].flatMap((image) => {
          const src = image.getAttribute("src");
          return src ? [new URL(src, pageUrl).href] : [];
        }),
      );
    }

    for (const link of document.querySelectorAll("#page a[href]")) {
      const href = link.getAttribute("href");
      if (!href) continue;
      const page = new URL(href, pageUrl).href;
      if (page.startsWith(`${baseUrl}/wap/xbbs.php?`) && !visited.has(page))
        pages.push(page);
    }
  }

  return images;
}

/** @param {string} id @param {string} title @param {string} link @param {string} description @returns {import("../source.d.ts").Source} */
function createSource(id, title, link, description) {
  return {
    id,
    title,
    link,
    description,
    encoding: "gbk",
    changeBatchSize: 5,
    changeBatchDelay: 4 * 60 * 60 * 1000,
    filterChangeCandidates(capturedContent, history) {
      const publishedCommentIds = new Set(
        history.contents.flatMap((content) =>
          [...content.matchAll(/data-comment-id="(\d+)"/g)].map(([, id]) => id),
        ),
      );
      return (capturedContent.changeCandidates || []).filter(
        (update, index) =>
          index > 0 &&
          !publishedCommentIds.has(update.id.split("#comment-")[1]),
      );
    },
    buildChangeEntries(capturedContent, candidate, changeCandidates) {
      if (!changeCandidates.length) return [];
      const threadLink = candidate.link || link;
      return [
        {
          id: `${threadLink}#comments-${changeCandidates.map((update) => update.id.split("#comment-")[1]).join("-")}`,
          title: changeCandidates[0].title,
          link: threadLink,
          content: `<p><a href="${threadLink}">View thread</a></p><hr><h3>New Comments</h3>${changeCandidates.map((update) => update.content).join("<hr>")}`,
          date: changeCandidates.at(-1)?.date,
        },
      ];
    },
    async extract(document, url) {
      const boardAndThread = new URL(url).searchParams.get("B");
      const boardId = boardAndThread?.split("_")[0];
      const scripts = [...document.querySelectorAll("script")]
        .map((node) => node.textContent)
        .join("\n");
      const bodies = new Map(
        [...scripts.matchAll(/zc\((\d+),'((?:\\.|[^'])*)'\);/gs)].map(
          ([, id, body]) => [id, body],
        ),
      );
      const comments = [
        ...scripts.matchAll(/zt\(\d+,(\d+),\d+,(\d+),'(.*?)',(\d+),'(.*?)'/gs),
      ]
        .map(([, id, timestamp, title, userId, author]) => ({
          id,
          title,
          userId,
          author,
          date: new Date(Number(timestamp) * 1000),
        }))
        .sort((left, right) => left.date.valueOf() - right.date.valueOf());
      if (!comments.length) return null;
      const images = boardAndThread
        ? await imagesByComment(boardAndThread)
        : new Map();

      const threadLink = boardAndThread
        ? `${baseUrl}/wap/xbbs.php?B=${boardAndThread}`
        : url;
      const commentContent = (comment) => {
        const link =
          boardId && `${baseUrl}/wap/xbbs.php?B=${boardId}_${comment.id}`;
        const bodyText = bodies.get(comment.id);
        const body = bodyText
          ? text(bodyText).replace(
              "(more...)",
              link ? `(<a href="${link}">more...</a>)` : "(more...)",
            )
          : "";
        const media =
          images
            .get(comment.id)
            ?.map(
              /** @param {string} image */ (image) => `<img src="${image}">`,
            )
            .join("") || "";
        return `<article data-comment-id="${comment.id}"><h3>${text(comment.title)}</h3>${body && `<p>${body}</p>`}${media}<p><small><a href="${baseUrl}/sForum/user.php?B=${comment.userId}">${text(comment.author)}</a> · ${comment.date.toUTCString()}</small></p></article>`;
      };
      return {
        title: decode(comments[0].title),
        date: comments.at(-1)?.date,
        content: comments.map(commentContent).join(""),
        changeCandidates: comments.map((comment) => ({
          id: `${threadLink}#comment-${comment.id}`,
          title: `💬 ${decode(comments[0].title)}`,
          link: boardId
            ? `${baseUrl}/wap/xbbs.php?B=${boardId}_${comment.id}`
            : threadLink,
          content: commentContent(comment),
          date: comment.date,
        })),
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
            link: boardAndThread
              ? `${baseUrl}/wap/xbbs.php?B=${boardAndThread}`
              : "",
            contentUrl: boardAndThread
              ? `${baseUrl}/sForum/ztree.php?B=${boardAndThread}`
              : "",
            title,
          };
        })
        .filter((item) => item.title && !item.title.includes("[置顶]"));
    },
  };
}

export default [
  createSource(
    "huasing",
    "华新鲜事",
    `${baseUrl}/sForum/zsbbs.php`,
    "华新论坛最新帖子",
  ),
  createSource(
    "huasing-family",
    "华新 · 家有儿女",
    `${baseUrl}/sForum/bbs.php?B=179`,
    "华新论坛家有儿女版最新帖子",
  ),
];
