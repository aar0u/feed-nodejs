const baseUrl = "https://www.8world.com";

function articleData(document) {
  try {
    const data = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent || "{}");
    return data["@graph"]?.find((item) => item["@type"] === "NewsArticle");
  } catch {
    return undefined;
  }
}

/** @type {import("../source.d.ts").Source} */
const source = {
  id: "8world",
  title: "8视界",
  link: baseUrl,
  description: "8视界首页",
  extract(document, url) {
    const article = articleData(document);
    const caption = document.querySelector("figure.article-media figcaption")?.textContent.trim();
    const videoUrl = document.querySelector(".video-wrapper video-js") && url;
    document.querySelectorAll("header[role='banner'], #playerlist, [data-column='One-Third'], #block-remenremen, .google-preferred-source, .mc-text-to-speech-wrapper, .article-edm, .nav-menu-tools-wrapper, .mc-fast-button-block, .video-wrapper").forEach((node) => node.remove());
    const targets = [...document.querySelectorAll(".article-content .text-long")];
    if (!targets.length) return null;
    const first = targets[0];
    const src = article?.image?.at(-1) || document.querySelector('meta[property="og:image"]')?.getAttribute("content");
    if (src && !targets.some((target) => [...target.querySelectorAll("img")].some((image) => image.src === new URL(src, url).href))) {
      const image = document.createElement("img");
      image.src = src;
      first.insertBefore(image, first.firstChild);
      if (caption) {
        const text = document.createElement("small");
        text.textContent = caption;
        first.insertBefore(text, image.nextSibling);
      }
    }
    if (videoUrl) {
      const notice = document.createElement("p");
      const link = document.createElement("a");
      link.href = videoUrl;
      link.textContent = "点击这里观看视频";
      link.setAttribute("target", "_blank");
      notice.textContent = "本文包含视频内容 ➡️ ";
      const strong = document.createElement("strong");
      strong.append(link);
      notice.append(strong);
      first.insertBefore(notice, first.firstChild);
    }
    return {
      content: targets.map((target) => target.innerHTML).join(""),
      date: article?.datePublished ? new Date(article.datePublished) : undefined,
    };
  },
  extractItems(document) {
    const start = document.querySelector(".layout--onecol.custom-row");
    const end = document.querySelector(".layout--one-third-two-third.custom-row");
    const sections = [];

    for (let node = start; node && node !== end; node = node.nextElementSibling) {
      sections.push(node);
    }
    if (!sections.length && start) sections.push(start);

    return sections.flatMap((section) => [...section.querySelectorAll("article.article")]).map((article) => {
      const link = article.querySelector("a.article-link")?.getAttribute("href");
      return {
        link,
        title: article.querySelector(".article-title a")?.textContent.trim(),
        date: article.querySelector("time.time")?.getAttribute("datetime"),
      };
    });
  },
};

export default source;
