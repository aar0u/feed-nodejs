import assert from "node:assert/strict";
import test from "node:test";
import timers from "node:timers/promises";
import { syncBuiltinESMExports } from "node:module";
import { parseHTML } from "linkedom";
import source from "../src/sources/hackernews.mjs";

test.beforeEach((t) => {
  t.mock.method(timers, "setTimeout", async (_ms, _value, options) =>
    options?.signal?.throwIfAborted(),
  );
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
});

function comment(id, indent) {
  return `<tr class="athing comtr" id="${id}"><td><img class="ind" indent="${indent}"></td><td><a class="hnuser">user${id}</a><span class="age" title="2026-08-26T12:00:00 0"></span><div class="commtext">comment ${id}</div></td></tr>`;
}

function storyPage(id) {
  return `<html op="news"><body><table>
    <tr class="athing submission" id="${id}"><td><span class="titleline"><a href="item?id=${id}">Story ${id}</a></span></td></tr>
    <tr><td></td><td><span class="score">${id * 100} points</span><span class="age" title="2026-09-30T10:00:00"></span></td></tr>
  </table></body></html>`;
}

test("Hacker News fetches the two list pages one at a time", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const requested = [];
  let live = 0;
  let maxLive = 0;
  globalThis.fetch = async (input) => {
    requested.push(String(input));
    live += 1;
    maxLive = Math.max(maxLive, live);
    await new Promise((resolve) => setTimeout(resolve, 10));
    live -= 1;
    return new Response(storyPage(requested.length), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };

  const items = await source.fetchItems();

  assert.equal(maxLive, 1);
  assert.deepEqual(requested, [
    "https://news.ycombinator.com/news",
    "https://news.ycombinator.com/news?p=2",
  ]);
  assert.deepEqual(
    items.map(({ title, score }) => ({ title, score })),
    [
      { title: "Story 2", score: 200 },
      { title: "Story 1", score: 100 },
    ],
  );
});

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
  assert.match(
    capturedContent?.content || "",
    /item\?id=1">20260826T20:00:00<\//,
  );
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

test("Hacker News keeps successful list pages and fails only when both fail", async (t) => {
  for (const failures of [
    [false, true],
    [true, false],
    [true, true],
  ]) {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => {
      const failed = failures[calls++];
      return new Response(failed ? "Sorry" : storyPage(calls), {
        status: failed ? 419 : 200,
      });
    });
    if (failures.every(Boolean))
      await assert.rejects(source.fetchItems(), /419/);
    else {
      const items = await source.fetchItems();
      assert.deepEqual(
        items.map(({ title }) => title),
        [failures[0] ? "Story 2" : "Story 1"],
      );
    }
    assert.equal(calls, 2);
  }
});

test("Hacker News keeps the first list page when cancellation interrupts the next page", async (t) => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    controller.abort(new Error("source deadline"));
    return new Response(storyPage(1));
  });
  const items = await source.fetchItems(controller.signal);
  assert.equal(calls, 1);
  assert.equal(items[0].title, "Story 1");
});
