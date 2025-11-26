const baseUrl = "https://www.zaobao.com.sg";

function publishedDate(document) {
  for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(node.textContent);
      const date = (data["@graph"] || [data]).find((item) => [item["@type"]].flat().includes("NewsArticle"))?.datePublished;
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
  description: "新加坡、中国、亚洲和国际的即时、评论、商业、体育、生活、科技与多媒体新闻，尽在联合早报。",
  extract(document, url) {
    document.querySelectorAll(".bff-google-ad, .bff-recommend-article").forEach((node) => node.remove());
    document.querySelector('a[href*="newspost.newslink.sg"]')?.parentElement?.remove();
    document.querySelector('a[href*="ref=previous-article"]')?.parentElement?.parentElement?.remove();
    document.querySelector('img[src*="tag-icon"]')?.parentElement?.parentElement?.parentElement?.remove();
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
    const lead = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
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
    const content = target?.innerHTML;
    return content?.trim() ? { content, date: publishedDate(document) } : null;
  },
  extractItems(document) {
    return [
      ...document.querySelectorAll(".news-feature-card"),
      ...document.querySelectorAll(".homepage-today-recommended-3-col-layout li"),
    ]
      .filter((item) => item.querySelector("h2") && !item.querySelector('[data-testid^="test-realtime-article-card"]'))
      .map((item) => ({
        link: item.querySelector("a")?.getAttribute("href"),
        title: item.querySelector("h2")?.textContent.trim(),
      }));
  },
};

export default source;
