const baseUrl = "http://bbs.huasing.org";

function decode(value = "") {
  return value
    .replace(/\\'/g, "'")
    .replace(/\\n/g, "\n")
    .replace(/\\u3000/g, "　");
}

function text(value) {
  return decode(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/　　/g, "<br><br>")
    .replace(/\n/g, "<br>");
}

/** @type {import("../source.d.ts").Source} */
const source = {
  id: "huasing",
  title: "华新鲜事",
  link: `${baseUrl}/sForum/zsbbs.php`,
  description: "华新论坛最新帖子",
  encoding: "gbk",
  extract(document, url) {
    const boardId = new URL(url).searchParams.get("B")?.split("_")[0];
    const scripts = [...document.querySelectorAll("script")].map((node) => node.textContent).join("\n");
    const bodies = new Map([...scripts.matchAll(/zc\((\d+),'((?:\\.|[^'])*)'\);/gs)].map(([, id, body]) => [id, body]));
    const posts = [...scripts.matchAll(/zt\(\d+,(\d+),\d+,(\d+),'(.*?)',(\d+),'(.*?)'/gs)]
      .map(([, id, timestamp, title, userId, author]) => ({ id, title, userId, author, date: new Date(Number(timestamp) * 1000) }))
      .sort((left, right) => left.date.valueOf() - right.date.valueOf());
    if (!posts.length) return null;

    return {
      title: decode(posts[0].title),
      date: posts.at(-1).date,
      content: posts.map((post) => {
        const link = boardId && `${baseUrl}/wap/xbbs.php?B=${boardId}_${post.id}`;
        const body = bodies.has(post.id) ? text(bodies.get(post.id)).replace("(more...)", link ? `(<a href="${link}">more...</a>)` : "(more...)") : "";
        return `<article><h3>${text(post.title)}</h3>${body && `<p>${body}</p>`}<p><small><a href="${baseUrl}/sForum/user.php?B=${post.userId}">${text(post.author)}</a> · ${post.date.toUTCString()}</small></p></article>`;
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
