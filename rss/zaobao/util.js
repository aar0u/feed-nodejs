import got from "../../utils/got.js";
import * as cheerio from "cheerio";

const baseUrl = "https://www.zaobao.com.sg";
const got_ins = got.extend({
  headers: {
    Referer: baseUrl,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    Cookie: "country=sg",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
  timeout: {
    request: 10000,
  },
  retry: {
    limit: 3,
  },
});

const parseList = async (ctx, sectionUrl) => {
  const response = await got_ins.get(baseUrl + sectionUrl);
  const $ = cheerio.load(response.data);

  console.log("Page URL:", baseUrl + sectionUrl);

  // 获取指定区域的新闻，包括今日要闻和推荐新闻，排除即时新闻
  const newsFeature = $(".news-feature-card").filter((_, el) => $(el).find("h2").length > 0);
  const recommendedNews = $(".homepage-today-recommended-3-col-layout li");

  let data = $([...newsFeature.toArray(), ...recommendedNews.toArray()]).filter(
    (_, el) => {
      return (
        $(el).find("h2").length > 0 &&
        !$(el).find('[data-testid^="test-realtime-article-card"]').length
      );
    }
  );
  console.log("Found articles:", data.length);

  // 更新标题选择器
  const title = $("main h1").text().trim() || "新加坡新闻";

  const resultList = [];

  for (const item of data.toArray()) {
    const $item = $(item);
    const href = $item.find("a").first().attr("href");
    const link = href ? (href.startsWith("http") ? href : baseUrl + href) : "";
    const itemTitle = $item.find("h2").text().trim();
    const listPageImg = $item.find("picture img").attr("src")?.split('?')[0];
    console.log("Found title:", itemTitle);

    const value = await ctx.cache.get(link);
    if (value) {
      resultList.push(JSON.parse(value));
      continue;
    }

      const articleData = await processArticle(link, listPageImg);
      if (!articleData || !articleData.description) {
        continue;
      }

      const resultItem = {
        title: itemTitle,
        description: articleData.description,
        pubDate: articleData.time ? articleData.time.toUTCString() : undefined,
        link: link,
      };

      await ctx.cache.set(link, JSON.stringify(resultItem));
      resultList.push(resultItem);
  }

  return {
    title: title,
    resultList: resultList,
  };
};

export async function processArticle(link, listPageImg) {
  try {
    const article = await got_ins.get(link);
    const $article = cheerio.load(article.data);

    // 从 JSON-LD 获取文章信息
    let time, imgUrl;
    const scriptContent = $article("script#seo-article-page").html();
    if (scriptContent) {
      try {
        const jsonData = JSON.parse(scriptContent);
        const articleData = jsonData["@graph"].find(
          (item) => item["@type"] === "NewsArticle"
        );
        if (articleData) {
          if (articleData.datePublished) {
            time = new Date(articleData.datePublished);
          }
          if (articleData.image && articleData.image.url) {
            imgUrl = articleData.image.url;
          }
        }
      } catch (e) {
        console.log("Error parsing JSON-LD:", e);
      }
    }

    if (!imgUrl && listPageImg) {
      imgUrl = listPageImg;
    }

    $article(".bff-google-ad").remove();
    $article(".bff-recommend-article").remove();
    let description = $article(".articleBody").html();
   
    if (imgUrl) {
      description = `<img src="${imgUrl}" />` + (description || "");
    }

    return { description, time };
  } catch (error) {
    console.log("Error fetching article:", link, error.message);
    return null;
  }
}

export { parseList };
