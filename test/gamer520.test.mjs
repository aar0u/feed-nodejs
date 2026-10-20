import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import source, { extractItems, proxyUrl } from "../src/sources/gamer520.mjs";

test("gamer520 extracts game entries from the switch category", () => {
  const { document } = parseHTML(`
    <div class="posts-wrapper">
      <article class="post post-grid">
        <h2 class="entry-title"><a href="https://www.gamer520.com/124231.html" title="失落的奥德赛|移植版|">失落的奥德赛|移植版|</a></h2>
        <time datetime="2026-10-19T03:00:38+08:00">9 小时前</time>
      </article>
      <article class="post post-grid">
        <h2 class="entry-title"><a href="https://www.gamer520.com/124203.html">愤怒的小鸟 星球大战2|移植版|</a></h2>
        <time datetime="2026-10-17T06:59:32+08:00">2 天前</time>
      </article>
    </div>
  `);
  assert.deepEqual(extractItems(document), [
    {
      link: "https://www.gamer520.com/124231.html",
      title: "失落的奥德赛|移植版|",
      date: "2026-10-19T03:00:38+08:00",
    },
    {
      link: "https://www.gamer520.com/124203.html",
      title: "愤怒的小鸟 星球大战2|移植版|",
      date: "2026-10-17T06:59:32+08:00",
    },
  ]);
});

test("gamer520 keeps the download panel in the article body", () => {
  const { document } = parseHTML(`
    <article class="article-content">
      <div class="entry-content u-text-format u-clearfix">
        <p><img src="https://img.odbgo.com/i/2026/10/19/6ad57274132c2.jpg"></p>
        <div class="bdp-container"><div class="bdp-card bdp-xunlei"><a href="https://pan.xunlei.com/s/VP4GnHofsh4bjVwnfs7HH7YcA1?pwd=uthm" class="bdp-btn">⚡ 极速云盘下载</a></div></div>
      </div>
      <div id="pay-single-box"></div>
    </article>
  `);
  const content = source.extract?.(
    document,
    "https://www.gamer520.com/124231.html",
  )?.content;
  assert.match(content || "", /img\.odbgo\.com/);
  assert.match(content || "", /pan\.xunlei\.com/);
  assert.doesNotMatch(content || "", /pay-single-box/);
});

test("gamer520 proxies list and article fetches while preserving original URLs and dates", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(input);
    assert.notEqual(url.hostname, "www.gamer520.com");
    requests.push(url.searchParams.get("url"));
    assert.equal(options.signal.aborted, false);
    return new Response(
      requests.length === 1
        ? '<div class="posts-wrapper"><article><h2 class="entry-title"><a href="https://www.gamer520.com/123.html">Game</a></h2><time datetime="2026-10-19T03:00:00+08:00"></time></article></div>'
        : '<time datetime="2026-10-19T03:00:00+08:00"></time><div class="entry-content"><img src="/cover.jpg"><a href="/download?id=1">Download</a></div>',
    );
  });
  const signal = AbortSignal.timeout(1000);
  const items = await source.fetchItems(signal);
  assert.equal(items[0].link, "https://www.gamer520.com/123.html");
  const captured = await source.fetchContent(items[0], signal);
  assert.match(captured.content, /https:\/\/www\.gamer520\.com\/cover\.jpg/);
  assert.match(
    captured.content,
    /https:\/\/www\.gamer520\.com\/download\?id=1/,
  );
  assert.doesNotMatch(captured.content, /spotjoy/);
  assert.equal(captured.date.toISOString(), "2026-10-18T19:00:00.000Z");
  assert.deepEqual(requests, [
    "https://www.gamer520.com/gameswitch",
    "https://www.gamer520.com/123.html",
  ]);
  assert.equal(source.contentFetchConcurrency, 1);
});

test("gamer520 rejects proxy responses without expected content", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("<html>Challenge</html>"),
  );
  await assert.rejects(source.fetchItems(), /no game articles/);
  await assert.rejects(
    source.fetchContent({ link: "https://www.gamer520.com/123.html" }),
    /no entry content/,
  );
});

test("gamer520 proxy URLs enforce the target origin and configurable endpoint", () => {
  const url = proxyUrl("/123.html?a=1&b=2", "https://proxy.example/fetch");
  assert.equal(url.origin, "https://proxy.example");
  assert.equal(
    url.searchParams.get("url"),
    "https://www.gamer520.com/123.html?a=1&b=2",
  );
  for (const target of [
    "https://evil.example/",
    "http://www.gamer520.com/",
    "https://user:pass@www.gamer520.com/",
  ])
    assert.throws(() => proxyUrl(target), /outside Gamer520/);
  assert.throws(() => proxyUrl("/123.html", "http://proxy.example/"), /HTTPS/);
});

test("gamer520 proxy fetches honor source cancellation", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, { signal }) => {
    signal.throwIfAborted();
    throw new Error("unexpected request");
  });
  const signal = AbortSignal.abort(new Error("source deadline"));
  await assert.rejects(source.fetchItems(signal), /source deadline/);
  await assert.rejects(
    source.fetchContent({ link: "https://www.gamer520.com/123.html" }, signal),
    /source deadline/,
  );
});
