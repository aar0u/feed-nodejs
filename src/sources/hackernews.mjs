import { fetchDocument } from "../utils/parser.mjs";

const siteUrl = "https://news.ycombinator.com/";
const newsUrl = new URL("news", siteUrl).href;
const minPoints = 50;
const storyCount = 20;
const commentCount = 8;

/** @param {string} id */
function discussionUrl(id) {
  return new URL(`item?id=${id}`, siteUrl).href;
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
      const date = subtext?.querySelector(".age")?.getAttribute("title");
      return {
        link: href ? new URL(href, siteUrl).href : undefined,
        articleUrl: discussionUrl(story.id),
        title,
        date: date || undefined,
        score,
      };
    })
    .filter((story) => story.title && story.score >= minPoints);
}

/** @param {Document} document */
function comments(document) {
  return [...document.querySelectorAll("tr.athing.comtr")]
    .filter(
      (comment) =>
        comment.querySelector(".ind")?.getAttribute("indent") === "0" &&
        comment.querySelector(".hnuser") &&
        comment.querySelector(".commtext")?.innerHTML,
    )
    .slice(0, commentCount);
}

/** @type {import("../source.d.ts").Source} */
const source = {
  id: "hackernews",
  title: "Hacker News 高赞",
  link: newsUrl,
  description: "Hacker News 中得分至少 50 points 的文章及热门评论",
  concurrency: 3,
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
    const topComments = comments(document);
    return {
      content: [
        score &&
          `<p><strong>${score}</strong> · <a href="${url}">View discussion</a></p>`,
        text,
        topComments.length &&
          `<hr><h3>热门评论</h3>${topComments.map((comment) => `<blockquote>${comment.querySelector(".commtext")?.innerHTML}<footer>— ${comment.querySelector(".hnuser")?.textContent} · <a href="${discussionUrl(comment.id)}">View comment</a></footer></blockquote>`).join("")}`,
      ]
        .filter(Boolean)
        .join(""),
    };
  },
};

export default source;
