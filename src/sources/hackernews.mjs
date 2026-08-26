import { fetchDocument } from "../utils/parser.mjs";
import { formatTimestamp } from "../utils/time.mjs";

const siteUrl = "https://news.ycombinator.com/";
const newsUrl = new URL("news", siteUrl).href;
const minPoints = 50;
const storyCount = 18;
const rootCommentCount = 3;
const replyCount = 2;

/** @param {string} id */
function discussionUrl(id) {
  return new URL(`item?id=${id}`, siteUrl).href;
}

/** @param {string} username */
function userUrl(username) {
  return new URL(`user?id=${encodeURIComponent(username)}`, siteUrl).href;
}

/** @param {string} url @param {string | undefined} score */
function discussionHtml(url, score) {
  return `<p>${score ? `<strong>${score}</strong> · ` : ""}<a href="${url}">View discussion</a></p>`;
}

/** @param {Document} document */
function stories(document) {
  return [...document.querySelectorAll("tr.athing.submission")]
    .map((story) => {
      const subtext = story.nextElementSibling;
      const score = Number(
        subtext?.querySelector(".score")?.textContent.match(/^\d+/)?.[0],
      );
      const titleLink = story.querySelector(".titleline > a");
      const title = titleLink?.textContent.trim();
      const href = titleLink?.getAttribute("href");
      const date = subtext
        ?.querySelector(".age")
        ?.getAttribute("title")
        ?.split(" ")[0];
      return {
        link: href ? new URL(href, siteUrl).href : undefined,
        contentUrl: discussionUrl(story.id),
        title,
        date: date || undefined,
        score,
      };
    })
    .filter((story) => story.title && story.score >= minPoints);
}

/** @param {Element} node */
function comment(node) {
  const author = node.querySelector(".hnuser")?.textContent;
  const content = node.querySelector(".commtext")?.innerHTML;
  const date = node.querySelector(".age")?.getAttribute("title")?.split(" ")[0];
  return author && content
    ? { id: node.id, author, content, date: date || undefined }
    : undefined;
}

/** @param {Document} document */
function comments(document) {
  /** @type {{ comment: { id: string, author: string, content: string, date?: string }, replies: { id: string, author: string, content: string, date?: string }[] }[]} */
  const roots = [];
  /** @type {{ comment: { id: string, author: string, content: string, date?: string }, replies: { id: string, author: string, content: string, date?: string }[] } | undefined} */
  let root;
  for (const node of document.querySelectorAll("tr.athing.comtr")) {
    const indent = node.querySelector(".ind")?.getAttribute("indent");
    const value = comment(node);
    if (indent === "0") {
      root = value && { comment: value, replies: [] };
      if (root && roots.length < rootCommentCount) roots.push(root);
      else root = undefined;
    } else if (
      indent === "1" &&
      root &&
      value &&
      root.replies.length < replyCount
    ) {
      root.replies.push(value);
    }
  }
  return roots;
}

/** @param {{ id: string, author: string, content: string, date?: string }} comment */
function commentMeta(comment) {
  const timestamp =
    comment.date &&
    formatTimestamp(
      new Date(comment.date.endsWith("Z") ? comment.date : `${comment.date}Z`),
    );
  return `<a href="${userUrl(comment.author)}">${comment.author}</a> · <a href="${discussionUrl(comment.id)}">${timestamp || "View comment"}</a>`;
}

/** @param {{ id: string, author: string, content: string, date?: string }} comment */
function commentContent(comment) {
  return `<article data-comment-id="${comment.id}"><div>${comment.content}</div><p><small>— ${commentMeta(comment)}</small></p></article>`;
}

/** @param {{ id: string, author: string, content: string, date?: string }} reply @param {{ id: string, author: string, content: string, date?: string }} parent */
function replyHtml(reply, parent) {
  return `<p><small><strong>↳ Reply to <a href="${userUrl(parent.author)}">${parent.author}</a></strong></small></p>${commentContent(reply)}`;
}

/** @param {{ id: string, author: string, content: string, date?: string }} comment @param {{ id: string, author: string, content: string, date?: string }[]} replies */
function threadHtml(comment, replies) {
  return `<blockquote>${commentContent(comment)}${replies.map((reply) => `<blockquote>${replyHtml(reply, comment)}</blockquote>`).join("")}</blockquote>`;
}

/** @param {string[]} comments @param {string} [heading] */
function commentsHtml(comments, heading) {
  return comments.length
    ? `<hr>${heading ? `<h3>${heading}</h3>` : ""}${comments.join("<hr>")}`
    : "";
}

/** @type {import("../source.d.ts").Source} */
const source = {
  id: "hackernews",
  title: "Hacker News Top Stories",
  link: newsUrl,
  description: "Hacker News stories with at least 50 points and top comments",
  contentFetchConcurrency: 2,
  requestDelay: 800,
  buildChangeEntries(capturedContent, candidate, history) {
    const publishedCommentIds = new Set(
      history.contents.flatMap((content) =>
        [...content.matchAll(/data-comment-id="(\d+)"|item\?id=(\d+)/g)].map(
          ([, dataId, linkId]) => dataId || linkId,
        ),
      ),
    );
    const changeCandidates = (capturedContent.changeCandidates || []).filter(
      (update) => !publishedCommentIds.has(update.id.split("#comment-")[1]),
    );
    if (!changeCandidates.length) return [];
    const mainLink = candidate.link || newsUrl;
    const discussionLink = candidate.contentUrl || mainLink;
    const score = capturedContent.content.match(
      /^<p><strong>([^<]+)<\/strong>/,
    )?.[1];
    return [
      {
        id: `${mainLink}#comments-${changeCandidates.map((change) => change.id.split("#comment-")[1]).join("-")}`,
        title: changeCandidates[0].title,
        link: mainLink,
        content: `${discussionHtml(discussionLink, score)}${commentsHtml(
          changeCandidates.map((change) => change.content),
          "New Comments",
        )}`,
        date: changeCandidates.at(-1)?.date,
      },
    ];
  },
  async fetchItems() {
    const documents = await Promise.all(
      ["news", "news?p=2"].map((path) => fetchDocument(new URL(path, siteUrl))),
    );
    return documents
      .flatMap(stories)
      .sort((left, right) => right.score - left.score)
      .slice(0, storyCount);
  },
  extract(document, url) {
    const score = document.querySelector(".fatitem .score")?.textContent;
    const text = document.querySelector(".toptext")?.innerHTML;
    const titleLink = document.querySelector(".titleline > a");
    const sourceHref = titleLink?.getAttribute("href");
    const sourceLink = sourceHref && new URL(sourceHref, siteUrl).href;
    const sourceTitle = titleLink?.textContent.trim() || "Hacker News";
    const topComments = comments(document);
    const commentChanges = topComments.flatMap(({ comment, replies }) => [
      { comment, content: threadHtml(comment, []) },
      ...replies.map((reply) => ({
        comment: reply,
        content: `<blockquote><p><small>${commentMeta(comment)}</small></p><blockquote>${replyHtml(reply, comment)}</blockquote></blockquote>`,
      })),
    ]);
    const dates = commentChanges.flatMap(({ comment }) =>
      comment.date ? [comment.date] : [],
    );
    return {
      date: dates.sort().at(-1),
      content: [
        discussionHtml(url, score),
        text,
        commentsHtml(
          topComments.map(({ comment, replies }) =>
            threadHtml(comment, replies),
          ),
          "Top Comments",
        ),
      ]
        .filter(Boolean)
        .join(""),
      changeCandidates: sourceLink
        ? commentChanges.map(({ comment, content }) => ({
            id: `${sourceLink}#comment-${comment.id}`,
            title: `💬 ${sourceTitle}`,
            link: discussionUrl(comment.id),
            content,
            date: comment.date,
          }))
        : [],
    };
  },
};

export default source;
