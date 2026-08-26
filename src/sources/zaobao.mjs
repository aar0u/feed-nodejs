import { brightcovePlayer } from "../utils/brightcove.mjs";

const baseUrl = "https://www.zaobao.com.sg";

/** @param {string} link */
function withoutRef(link) {
  const url = new URL(link, baseUrl);
  url.searchParams.delete("ref");
  return url.href;
}

/** @param {Document} document */
function publishedDate(document) {
  for (const node of document.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      const data = JSON.parse(node.textContent);
      /** @type {{ "@type"?: string | string[], datePublished?: string }[]} */
      const articles = data["@graph"] || [data];
      const date = articles.find((item) =>
        [item["@type"]].flat().includes("NewsArticle"),
      )?.datePublished;
      if (date) return new Date(date);
    } catch {
      continue;
    }
  }
  return undefined;
}

/** @type {import("../source.d.ts").Source} */
const source = {
  id: "zaobao",
  title: "联合早报",
  link: baseUrl,
  description:
    "新加坡、中国、亚洲和国际的即时、评论、商业、体育、生活、科技与多媒体新闻，尽在联合早报。",
  extract(document, url) {
    document
      .querySelectorAll(".bff-google-ad, .bff-recommend-article")
      .forEach((node) => node.remove());
    document
      .querySelector('a[href*="newspost.newslink.sg"]')
      ?.parentElement?.remove();
    document
      .querySelector('a[href*="ref=previous-article"]')
      ?.parentElement?.parentElement?.remove();
    document
      .querySelector('img[src*="tag-icon"]')
      ?.parentElement?.parentElement?.parentElement?.remove();
    document.querySelectorAll("figure.bff-inline-image").forEach((figure) => {
      const image = figure.querySelector("img");
      if (!image) return figure.remove();
      const paragraph = document.createElement("p");
      paragraph.append(image.cloneNode(true));
      const caption = figure.querySelector("figcaption")?.textContent.trim();
      if (caption) {
        const text = document.createElement("small");
        text.textContent = caption;
        paragraph.append(text);
      }
      figure.replaceWith(paragraph);
    });
    const target = document.querySelector(".articleBody");
    const lead = document
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content");
    if (target && lead) {
      const leadUrl = new URL(lead, url).href;
      const exists = [...target.querySelectorAll("img")].some((image) => {
        const src = image.getAttribute("src");
        return src ? new URL(src, url).href === leadUrl : false;
      });
      if (!exists) {
        const image = document.createElement("img");
        image.src = lead;
        target.insertBefore(image, target.firstChild);
      }
    }
    const video = target?.querySelector("video-js[data-video-id]");
    const player = video && brightcovePlayer(document, video);
    if (player) video.replaceWith(player);
    const hasVideo = Boolean(
      player ||
      document.querySelector(
        ".brightcove-container, meta[name='contentType'][content='video'], .articleBody video, .articleBody iframe[src*='youtube'], .articleBody iframe[src*='brightcove']",
      ),
    );
    if (target && hasVideo) {
      const notice = document.createElement("p");
      const link = document.createElement("a");
      link.href = url;
      link.textContent = "跳转原文";
      link.setAttribute("target", "_blank");
      notice.textContent = "文中含视频 ➡️ ";
      const strong = document.createElement("strong");
      strong.append(link);
      notice.append(strong);
      target.insertBefore(notice, target.firstChild);
    }
    const content = target?.innerHTML;
    return content?.trim() ? { content, date: publishedDate(document) } : null;
  },
  extractItems(document) {
    return [
      ...document.querySelectorAll(
        ".news-feature-card, .homepage-today-recommended-3-col-layout li",
      ),
    ]
      .filter(
        (item) =>
          item.querySelector("h2, h3") &&
          !item.querySelector('[data-testid^="test-realtime-article-card"]'),
      )
      .map((item) => {
        const link = item.querySelector("a")?.getAttribute("href") ?? undefined;
        return {
          link: link && withoutRef(link),
          title: item.querySelector("h2, h3")?.textContent.trim(),
        };
      });
  },
};

export default source;
