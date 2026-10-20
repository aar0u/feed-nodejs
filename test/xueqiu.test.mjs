import assert from "node:assert/strict";
import test from "node:test";
import { hotPosts, userTimeline } from "../src/sources/xueqiu/client.mjs";

/** @param {number} id */
function status(id) {
  return {
    id,
    target: `/u/${id}/${id}`,
    text: "",
    description: `truncated ${id}...`,
    created_at: 1700000000000,
  };
}

test("xueqiu fetches full text from the status detail endpoint", async () => {
  const requested = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    requested.push({ url, cookie: init.headers?.cookie });
    if (url.startsWith("https://xueqiu.com/about"))
      return new Response("", {
        headers: { "set-cookie": "xq_a_token=token; Path=/" },
      });
    if (url.includes("/v4/statuses/user_timeline.json"))
      return Response.json({ statuses: [status(1)] });
    if (url.includes("/statuses/hot/listV2.json"))
      return Response.json({ items: [{ original_status: status(2) }] });
    if (url.includes("/statuses/show.json")) {
      const id = new URL(url).searchParams.get("id");
      return Response.json({ text: `<p>full text ${id}</p>` });
    }
    throw new Error(`unexpected request: ${url}`);
  };

  try {
    const posts = await hotPosts();
    assert.equal(posts.length, 1);
    assert.match(posts[0].content, /full text 2/);
    assert.equal(posts[0].link, "https://xueqiu.com/u/2/2");

    const timeline = await userTimeline("1");
    assert.equal(timeline.length, 1);
    assert.match(timeline[0].content, /full text 1/);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(
    requested.some(({ url }) => url.includes("/statuses/show.json?id=2")),
    "hot posts are fetched through the detail endpoint",
  );
  for (const { url, cookie } of requested)
    if (url.includes("/statuses/"))
      assert.match(cookie || "", /xq_a_token=token/);
});

test("xueqiu falls back to list text when the detail request fails", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = String(input);
    if (url.includes("/about"))
      return new Response("", {
        headers: { "set-cookie": "xq_a_token=test; Path=/" },
      });
    if (url.includes("listV2"))
      return Response.json({ items: [{ original_status: status(3) }] });
    return new Response("Forbidden", { status: 403 });
  });
  const posts = await hotPosts();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].content, "truncated 3...");
});
