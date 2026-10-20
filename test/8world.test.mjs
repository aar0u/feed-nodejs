import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import source from "../src/sources/8world.mjs";

test("8world removes embedded social promotion", () => {
  const { document } = parseHTML(`
    <div class="article-content"><div class="text-long">
      <p>Article text</p>
      <div class="video-wrapper"><video-js data-video-id="123" data-account="456" data-player="default" data-embed="default"></video-js></div>
      <div class="embedded-entity"><div class="stories-sns">加入我们的社群!</div></div>
      <style>.stories-sns { display: flex; }</style>
      <div class="stories-sns">新闻深呼吸 8world Stories</div>
      <style>.stories-sns { color: red; }</style>
    </div></div>
  `);
  const content = source.extract(
    document,
    "https://www.8world.com/article",
  )?.content;
  assert.match(content || "", /Article text/);
  assert.doesNotMatch(content || "", /加入我们的社群|新闻深呼吸|stories-sns/);
  assert.match(
    content || "",
    /<p><iframe[^>]+players\.brightcove\.net\/456\/default_default\/index\.html\?videoId=123/,
  );
});

test("8world uses the last image URL from a JSON-LD ImageObject", () => {
  const { document } = parseHTML(`
    <script type="application/ld+json">${JSON.stringify({
      "@graph": [
        {
          "@type": "NewsArticle",
          image: {
            "@type": "ImageObject",
            url: [
              "https://cdn.example.com/small.jpg",
              "https://cdn.example.com/large.jpg",
            ],
          },
          datePublished: "2026-10-19T05:00:00Z",
        },
      ],
    })}</script>
    <div class="article-content"><div class="text-long">
      <p>Article text</p>
    </div></div>
  `);
  const captured = source.extract(document, "https://www.8world.com/article");
  assert.match(
    captured?.content || "",
    /<img src="https:\/\/cdn\.example\.com\/large\.jpg">/,
  );
  assert.equal(captured?.date?.toISOString(), "2026-10-19T05:00:00.000Z");
});
