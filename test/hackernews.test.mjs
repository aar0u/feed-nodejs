import assert from "node:assert/strict";
import test from "node:test";
import source from "../src/sources/hackernews.mjs";

/** @param {number} id @param {object} [fields] */
function story(id, fields = {}) {
  return {
    id,
    type: "story",
    title: `Story ${id}`,
    url: `https://example.com/${id}`,
    score: id,
    time: 1_788_000_000,
    ...fields,
  };
}

/** @param {number} id @param {number[]} [kids] @param {object} [fields] */
function comment(id, kids = [], fields = {}) {
  return {
    id,
    type: "comment",
    by: `user${id}`,
    text: `comment ${id}`,
    time: 1_788_000_000,
    kids,
    ...fields,
  };
}

/** @param {import("node:test").TestContext} t @param {Record<string, unknown>} api */
function mockApi(t, api) {
  const state = { live: 0, maxLive: 0, requested: [] };
  t.mock.method(globalThis, "fetch", async (input) => {
    const path = new URL(String(input)).pathname.replace("/v0/", "");
    state.requested.push(path);
    state.live += 1;
    state.maxLive = Math.max(state.maxLive, state.live);
    await new Promise((resolve) => setImmediate(resolve));
    state.live -= 1;
    return path in api
      ? Response.json(api[path])
      : new Response("", { status: 404, statusText: "Not Found" });
  });
  return state;
}

test("Hacker News lists stories with enough points by score using the API", async (t) => {
  const ids = Array.from({ length: 70 }, (_, index) => 1000 + index);
  const api = { "topstories.json": ids };
  for (const id of ids) api[`item/${id}.json`] = story(id, { score: 10 });
  api["item/1001.json"] = story(1001, { score: 300 });
  api["item/1002.json"] = story(1002, { score: 400, url: undefined });
  api["item/1003.json"] = story(1003, { score: 500, dead: true });
  api["item/1004.json"] = story(1004, { score: 600, type: "job" });
  api["item/1005.json"] = story(1005, { score: 50 });
  api["item/1065.json"] = story(1065, { score: 900 });
  const state = mockApi(t, api);

  const items = await source.fetchItems();

  assert.deepEqual(
    items.map(({ title, link, contentUrl }) => ({ title, link, contentUrl })),
    [
      {
        title: "Story 1002",
        link: "https://news.ycombinator.com/item?id=1002",
        contentUrl: "https://news.ycombinator.com/item?id=1002",
      },
      {
        title: "Story 1001",
        link: "https://example.com/1001",
        contentUrl: "https://news.ycombinator.com/item?id=1001",
      },
      {
        title: "Story 1005",
        link: "https://example.com/1005",
        contentUrl: "https://news.ycombinator.com/item?id=1005",
      },
    ],
  );
  assert.equal(state.requested.length, 61, "list plus the first 60 stories");
  assert.ok(state.maxLive <= 10);
});

test("Hacker News fails when the story list request fails", async (t) => {
  mockApi(t, {});
  await assert.rejects(source.fetchItems(), /404/);
});

test("Hacker News batches unseen comments from three roots and two replies", async (t) => {
  mockApi(t, {
    "item/1.json": comment(1, [11, 12, 13]),
    "item/11.json": comment(11),
    "item/12.json": comment(12, [], { dead: true }),
    "item/13.json": comment(13),
    "item/2.json": comment(2, [21, 22]),
    "item/21.json": comment(21),
    "item/22.json": comment(22),
    "item/3.json": comment(3, [31, 32]),
    "item/31.json": comment(31),
    "item/32.json": comment(32),
    "item/4.json": comment(4),
    "item/5.json": null,
    "item/6.json": comment(6, [], { deleted: true }),
  });
  const candidate = {
    link: "https://example.com/story",
    contentUrl: "https://news.ycombinator.com/item?id=1000",
    title: "Story",
    story: story(1000, {
      score: 120,
      text: "Article",
      kids: [5, 6, 1, 2, 3, 4],
    }),
  };

  const capturedContent = await source.fetchContent(candidate);

  assert.equal(capturedContent?.changeCandidates?.length, 9);
  assert.doesNotMatch(capturedContent?.content || "", /comment 4</);
  assert.match(
    capturedContent?.content || "",
    /^<p><strong>120 points<\/strong>/,
  );
  assert.match(capturedContent?.content || "", /Article<hr>/);
  assert.match(
    capturedContent?.content || "",
    /item\?id=1">20260829T18:40:00<\//,
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
    candidate,
    changeCandidates || [],
  );
  assert.equal(changeEntries?.length, 1);
  assert.match(changeEntries?.[0].id || "", /comments-11-13-2-21-22-3-31-32$/);
  assert.doesNotMatch(
    changeEntries?.[0].content || "",
    /<div>comment 1<\/div>/,
  );
  assert.doesNotMatch(changeEntries?.[0].content || "", /<div>comment 12</);
  assert.match(changeEntries?.[0].content || "", /↳ Reply to/);
  assert.match(
    changeEntries?.[0].content || "",
    /href="https:\/\/news\.ycombinator\.com\/user\?id=user1">user1<\/a>/,
  );
});
