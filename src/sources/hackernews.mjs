import { formatTimestamp } from "../utils/time.mjs";

const siteUrl = "https://news.ycombinator.com/";
const newsUrl = new URL("news", siteUrl).href;
const apiUrl = "https://hacker-news.firebaseio.com/v0/";
const minPoints = 50;
const storyCount = 15;
const listSize = 60;
const rootCommentCount = 3;
const replyCount = 2;
const listBatchSize = 10;

/** @typedef {{ id: string, author: string, content: string, date: string }} Comment */
/** @typedef {{ id: number, type?: string, title?: string, url?: string, text?: string, score?: number, time?: number, by?: string, kids?: number[], dead?: boolean, deleted?: boolean }} Item */

/** @param {string | number} id */
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

/** @param {number} id @param {AbortSignal} [signal] @returns {Promise<Item | null>} */
async function getItem(id, signal) {
  const response = await fetch(new URL(`item/${id}.json`, apiUrl), {
    signal: AbortSignal.any([
      AbortSignal.timeout(10_000),
      ...(signal ? [signal] : []),
    ]),
  });
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

/** @param {number} time */
function isoDate(time) {
  return new Date(time * 1000).toISOString();
}

/** @param {Item | null} item @returns {Comment | undefined} */
function comment(item) {
  return item &&
    !item.dead &&
    !item.deleted &&
    item.by &&
    item.text &&
    item.time
    ? {
        id: String(item.id),
        author: item.by,
        content: item.text,
        date: isoDate(item.time),
      }
    : undefined;
}

/** Fetches ids in batches of `count` until `count` valid comments are found.
 * @param {number[]} ids @param {number} count @param {AbortSignal} [signal]
 * @returns {Promise<(Comment & { kids: number[] })[]>} */
async function firstComments(ids, count, signal) {
  /** @type {(Comment & { kids: number[] })[]} */
  const found = [];
  for (
    let index = 0;
    index < ids.length && found.length < count;
    index += count
  ) {
    const items = await Promise.all(
      ids.slice(index, index + count).map((id) => getItem(id, signal)),
    );
    for (const item of items) {
      const value = comment(item);
      if (value && found.length < count)
        found.push({ ...value, kids: item?.kids || [] });
    }
  }
  return found;
}

/** @param {Comment[]} comments */
function latestDate(comments) {
  return comments
    .map(({ date }) => date)
    .sort()
    .at(-1);
}

/** @param {Comment} comment */
function commentMeta(comment) {
  const timestamp =
    comment.date &&
    formatTimestamp(
      new Date(comment.date.endsWith("Z") ? comment.date : `${comment.date}Z`),
    );
  return `<a href="${userUrl(comment.author)}">${comment.author}</a> · <a href="${discussionUrl(comment.id)}">${timestamp || "View comment"}</a>`;
}

/** @param {Comment} comment @param {string} [prefix] */
function commentContent(comment, prefix = "") {
  return `<article data-comment-id="${comment.id}"><div>${prefix}${comment.content}</div><p><small>— ${commentMeta(comment)}</small></p></article>`;
}

/** @param {Comment} reply @param {Comment} parent */
function replyContent(reply, parent) {
  return `<p><small><strong>↳ Reply to <a href="${userUrl(parent.author)}">${parent.author}</a></strong></small></p>${commentContent(reply)}`;
}

/** @param {Comment} reply @param {Comment} parent */
function changeHtml(reply, parent) {
  return `<p>💬 <small>${commentMeta(parent)}</small></p><blockquote>${replyContent(reply, parent)}</blockquote>`;
}

/** @param {Comment} comment @param {Comment[]} replies */
function threadHtml(comment, replies) {
  return `${commentContent(comment, "💬 ")}${replies.map((reply) => `<blockquote>${replyContent(reply, comment)}</blockquote>`).join("")}`;
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
  changeBatchSize: 10,
  changeBatchDelay: 4 * 60 * 60 * 1000,
  filterChangeCandidates(capturedContent, history) {
    const publishedCommentIds = new Set(
      history.contents.flatMap((content) =>
        [...content.matchAll(/data-comment-id="(\d+)"|item\?id=(\d+)/g)].map(
          ([, dataId, linkId]) => dataId || linkId,
        ),
      ),
    );
    return (capturedContent.changeCandidates || []).filter(
      (update) => !publishedCommentIds.has(update.id.split("#comment-")[1]),
    );
  },
  buildChangeEntries(capturedContent, candidate, changeCandidates) {
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
  async fetchItems(signal) {
    const response = await fetch(new URL("topstories.json", apiUrl), {
      signal: AbortSignal.any([
        AbortSignal.timeout(10_000),
        ...(signal ? [signal] : []),
      ]),
    });
    if (!response.ok)
      throw new Error(`${response.status} ${response.statusText}`);
    /** @type {number[]} */
    const ids = (await response.json()).slice(0, listSize);
    /** @type {(Item | null)[]} */
    const items = [];
    for (let index = 0; index < ids.length; index += listBatchSize)
      items.push(
        ...(await Promise.all(
          ids
            .slice(index, index + listBatchSize)
            .map((id) => getItem(id, signal)),
        )),
      );
    return items
      .flatMap((item) =>
        item &&
        item.type === "story" &&
        !item.dead &&
        !item.deleted &&
        item.title &&
        item.time &&
        (item.score ?? 0) >= minPoints
          ? [
              {
                ...item,
                title: item.title,
                time: item.time,
                score: item.score ?? 0,
              },
            ]
          : [],
      )
      .sort((left, right) => right.score - left.score)
      .slice(0, storyCount)
      .map((story) => ({
        link: story.url || discussionUrl(story.id),
        contentUrl: discussionUrl(story.id),
        title: story.title,
        date: isoDate(story.time),
        story,
      }));
  },
  async fetchContent(candidate, signal) {
    const { story } =
      /** @type {import("../source.d.ts").FeedEntryCandidate & { story?: Item }} */ (
        candidate
      );
    if (!story || !candidate.contentUrl || !candidate.link)
      throw new Error("missing story details");
    const roots = await firstComments(
      story.kids || [],
      rootCommentCount,
      signal,
    );
    const threads = await Promise.all(
      roots.map(async (root) => ({
        comment: root,
        replies: await firstComments(root.kids, replyCount, signal),
      })),
    );
    const sourceLink = candidate.link;
    const sourceTitle = story.title || "Hacker News";
    const commentChanges = threads.flatMap(({ comment, replies }) => [
      { comment, content: threadHtml(comment, []) },
      ...replies.map((reply) => ({
        comment: reply,
        content: changeHtml(reply, comment),
      })),
    ]);
    return {
      date: latestDate(commentChanges.map(({ comment }) => comment)),
      content: [
        discussionHtml(candidate.contentUrl, `${story.score} points`),
        story.text,
        commentsHtml(
          threads.map(({ comment, replies }) => threadHtml(comment, replies)),
          "Top Comments",
        ),
      ]
        .filter(Boolean)
        .join(""),
      changeCandidates: commentChanges.map(({ comment, content }) => ({
        id: `${sourceLink}#comment-${comment.id}`,
        title: `💬 ${sourceTitle}`,
        link: discussionUrl(comment.id),
        content,
        date: comment.date,
      })),
    };
  },
};

export default source;
