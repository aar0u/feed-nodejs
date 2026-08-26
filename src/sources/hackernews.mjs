const apiUrl = "https://hacker-news.firebaseio.com/v0/";
const siteUrl = "https://news.ycombinator.com/";
const minPoints = 50;
const storyCount = 60;
const commentCount = 3;

/** @typedef {{ id: number, type: string, title: string, score: number, time: number, kids?: number[], text?: string }} Story */
/** @typedef {{ id: number, type: string, by?: string, text?: string, dead?: boolean, deleted?: boolean }} Comment */

/** @param {string} path */
async function getJson(path) {
  const response = await fetch(new URL(path, apiUrl));
  if (!response.ok)
    throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

/** @param {number} id */
function discussionUrl(id) {
  return new URL(`item?id=${id}`, siteUrl).href;
}

/** @param {Story} story @returns {Promise<Comment[]>} */
async function comments(story) {
  /** @type {Comment[]} */
  const items = await Promise.all(
    (story.kids || [])
      .slice(0, commentCount)
      .map((id) => getJson(`item/${id}.json`)),
  );
  return items.filter(
    (comment) =>
      comment.type === "comment" &&
      !comment.deleted &&
      !comment.dead &&
      comment.text,
  );
}

/** @param {Story} story */
async function item(story) {
  const topComments = await comments(story);
  const content = [
    `<p><strong>${story.score} points</strong> · <a href="${discussionUrl(story.id)}">View discussion</a></p>`,
    story.text,
    topComments.length &&
      `<hr><h3>热门评论</h3>${topComments.map((comment) => `<blockquote>${comment.text}<footer>— ${comment.by || "unknown"} · <a href="${discussionUrl(comment.id)}">View comment</a></footer></blockquote>`).join("")}`,
  ]
    .filter(Boolean)
    .join("");
  return {
    link: discussionUrl(story.id),
    title: story.title,
    date: new Date(story.time * 1000),
    content,
  };
}

/** @type {import("../source.d.ts").Source} */
const source = {
  id: "hackernews",
  title: "Hacker News 高赞",
  link: siteUrl,
  description: "Hacker News 中得分至少 50 points 的文章及热门评论",
  async fetchItems() {
    /** @type {number[]} */
    const ids = await getJson("topstories.json");
    /** @type {Story[]} */
    const stories = await Promise.all(
      ids.slice(0, storyCount).map((id) => getJson(`item/${id}.json`)),
    );
    return Promise.all(
      stories
        .filter((story) => story?.type === "story" && story.score >= minPoints)
        .sort((left, right) => right.score - left.score)
        .slice(0, 20)
        .map(item),
    );
  },
};

export default source;
