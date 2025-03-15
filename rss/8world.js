import got from "../utils/got.js";
import * as cheerio from "cheerio";
import { log } from "../utils/logger.js";

const baseUrl = "https://www.8world.com";

export default async (ctx) => {
  const response = await got.get(baseUrl);
  const $ = cheerio.load(response.data);

  // 获取指定区域的新闻
  const targetSection = $(".layout--onecol.custom-row").first();
  const endSection = $(".layout--one-third-two-third.custom-row");
  let list = targetSection.nextUntil(endSection).find("article.article");
  if (list.length === 0) {
    list = targetSection.find("article.article");
  }
  log("Found items:", list.length);

  const items = await Promise.all(
    list.toArray().map(async (item) => {
      const $item = $(item);
      const href = $item.find("a.article-link").first().attr("href");
      log("Found href:", href);

      if (!href) {
        log("Skip invalid href $helf");
        return null;
      }

      const link = href.startsWith("http") ? href : baseUrl + href;
      const itemTitle = $item.find(".article-title a").text().trim();
      const timeStr = $item.find("time.time").attr("datetime");
      const listPageImg = $item.find("img.image").attr("src");

      const categories = [];
      $item.find(".article-meta-ul li").each((_, el) => {
        const text = $(el).find("span").text().trim();
        if (text) {
          categories.push(text);
        }
      });

      const description = await processArticle(link, listPageImg);
      if (!description) {
        return null;
      }

      // 处理时间格式
      let pubDate = new Date();
      if (timeStr) {
        const [date, time] = timeStr.split(" ");
        const [day, month, year] = date.split("/");
        const [hour, minute] = time.split(":");
        pubDate = new Date(year, month - 1, day, hour, minute);
      }

      return {
        title: itemTitle,
        link,
        description: description || "暂无内容",
        pubDate: pubDate.toUTCString(),
        category: categories,
      };
    })
  ).then((items) => items.filter(Boolean));

  ctx.state.data = {
    title: "8视界",
    link: baseUrl,
    description: "8视界首页",
    item: items,
  };
};

export async function processArticle(link, listPageImg) {
  try {
    const article = await got.get(link);
    const $ = cheerio.load(article.data);

    // 获取文章内容
    let description = $(
      ".article-content .text-long:not(:has(.stories-sns)), .article-image-custom, .paragraph-gallery"
    )
      .map((_, el) => $(el).html())
      .get()
      .join("");

    let imgUrl;
    // 尝试从 ld-json 获取图片
    try {
      const ldJson = JSON.parse($('script[type="application/ld+json"]').html());
      const newsArticle = ldJson["@graph"]?.find(
        (item) => item["@type"] === "NewsArticle"
      );
      if (newsArticle?.image?.length > 0) {
        imgUrl = newsArticle.image[newsArticle.image.length - 1];
      }
    } catch (e) {
      log("Error parsing ld-json:", e.message);
    }

    let caption;
    const articleMedia = $(
      "figure.article-media:has(.article-image, .article-video)"
    );
    if (articleMedia.length > 0) {
      articleMedia.find(".article-image, figcaption").remove();
      let media = articleMedia.html() || "";

      const articleImage = articleMedia.find(".article-image");
      if (!imgUrl && articleImage.length > 0) {
        const bgImage = articleImage.attr("style");
        imgUrl = bgImage?.match(/url\('([^']+)'\)/)?.[1];
      }
      caption = articleMedia.find("figcaption p").text().trim();
      description = `<div class="article-media">${media}</div>` + description;
    }

    if (!imgUrl && listPageImg) {
      imgUrl = listPageImg;
    }

    if (imgUrl) {
      if (caption) {
        description =
          `<p style="text-align: center; color: #666;">${caption}</p>` +
          description;
      }
      description = `<img src="${imgUrl}"/>` + description;
    }

    return description;
  } catch (error) {
    // 获取错误堆栈信息
    const errorLocation = error.stack ? `\nStack: ${error.stack}` : "";
    log(
      `Error processing article: ${link}`,
      `${error.message}${errorLocation}`
    );
    return null;
  }
}
