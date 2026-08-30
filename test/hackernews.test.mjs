import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import source from "../src/sources/hackernews.mjs";

function comment(id, indent) {
  return `<tr class="athing comtr" id="${id}"><td><img class="ind" indent="${indent}"></td><td><a class="hnuser">user${id}</a><span class="age" title="2026-08-26T12:00:00 0"></span><div class="commtext">comment ${id}</div></td></tr>`;
}

test("Hacker News batches unseen comments from three roots and two replies", () => {
  const { document } = parseHTML(`
    <div class="fatitem"><span class="titleline"><a href="https://example.com/story">Story</a></span></div>
    <div class="toptext">Article</div>
    ${comment(1, 0)}${comment(11, 1)}${comment(12, 1)}${comment(13, 1)}
    ${comment(2, 0)}${comment(21, 1)}${comment(22, 1)}
    ${comment(3, 0)}${comment(31, 1)}${comment(32, 1)}
    ${comment(4, 0)}
  `);
  const capturedContent = source.extract(
    document,
    "https://news.ycombinator.com/item?id=1",
  );
  assert.equal(capturedContent?.changeCandidates?.length, 9);
  assert.match(capturedContent?.content || "", /item\?id=1">20260826T20:00:00<\//);
  const changeCandidates = source.filterChangeCandidates?.(
    /** @type {import("../src/source.d.ts").CapturedContent} */ (
      capturedContent
    ),
    { contents: ['<article data-comment-id="1">'] },
  );
  const changeEntries = source.buildChangeEntries?.(
    /** @type {import("../src/source.d.ts").CapturedContent} */ (
      capturedContent
    ),
    {
      link: "https://example.com/story",
      contentUrl: "https://news.ycombinator.com/item?id=1",
      title: "Story",
    },
    changeCandidates || [],
  );
  assert.equal(changeEntries?.length, 1);
  assert.match(changeEntries?.[0].id || "", /comments-11-12-2-21-22-3-31-32$/);
  assert.doesNotMatch(
    changeEntries?.[0].content || "",
    /<div>comment 1<\/div>/,
  );
  assert.doesNotMatch(
    changeEntries?.[0].content || "",
    /<div>comment (13|4)<\/div>/,
  );
  assert.match(changeEntries?.[0].content || "", /↳ Reply to/);
  assert.match(
    changeEntries?.[0].content || "",
    /href="https:\/\/news\.ycombinator\.com\/user\?id=user1">user1<\/a>/,
  );
});
