import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { Feed } from "feed";

test("source deadline cancels nested requests and refreshes cached Xueqiu summaries", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "feed-deadline-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previous = join(directory, "previous");
  await mkdir(previous);
  const link = "https://xueqiu.com/3739298405/412883728";
  const feed = new Feed({ title: "Xueqiu", id: link, copyright: "" });
  feed.addItem({
    id: link,
    link,
    title: "Old summary",
    content: "truncated...",
    date: new Date("2026-10-19T00:00:00Z"),
  });
  await writeFile(join(previous, "xueqiu-hots.xml"), feed.rss2());
  const script = `
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = (ms) => timeout(ms === 60_000 ? 100 : ms);
    globalThis.fetch = async (input, options = {}) => {
      const url = new URL(input);
      const json = Response.json;
      if (url.hostname === "xueqiu.com") return new Response("", {headers: {"set-cookie": "xq_a_token=test; Path=/"}});
      if (url.pathname.includes("user_timeline")) return json({statuses: []});
      if (url.pathname.includes("listV2")) return json({items: [{original_status: {id: 412883728, target: "/3739298405/412883728", description: "summary..."}}]});
      if (url.pathname.includes("show.json")) return json({text: '<p>Complete final paragraph</p><img src="https://xqimg.imedao.com/photo.jpeg">', image_info_list: [{filename: "photo.jpeg"}]});
      if (url.hostname === "bbs.huasing.org") {
        const id = url.searchParams.get("B");
        if (url.pathname.endsWith("ztree.php")) return new Response("<script>zt(0," + id.split("_")[1] + ",0,1700000000,'Thread',1,'Author');zc(2,'Body');</script>");
        if (url.pathname.endsWith("xbbs.php")) {
          if (id === "1_2") return new Response("<html></html>");
          return new Promise((resolve, reject) => {
            options.signal.throwIfAborted();
            const socket = setTimeout(() => reject(new Error("request did not cancel")), 2000);
            options.signal.addEventListener("abort", () => {clearTimeout(socket); reject(options.signal.reason)}, {once:true});
          });
        }
        return new Response('<div id="s-1-2">Completed thread</div><div id="s-1-3">Slow thread</div>');
      }
      return new Response("Unavailable", {status: 503});
    };
    await import(${JSON.stringify(new URL("../src/index.mjs", import.meta.url).href)});
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      cwd: directory,
      env: { ...process.env, PUBLISHED_FEED_DIRECTORY: previous },
      timeout: 5000,
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const output = result.stdout + result.stderr;
  assert.match(output, /source deadline exceeded/);
  const rss = await readFile(
    join(directory, "public", "xueqiu-hots.xml"),
    "utf8",
  );
  assert.match(rss, /Complete final paragraph/);
  assert.doesNotMatch(rss, /truncated/);
  assert.equal((rss.match(/photo\.jpeg/g) || []).length, 1);
  assert.match(rss, /Mon, 19 Oct 2026 00:00:00 GMT/);
  const huasing = await readFile(
    join(directory, "public", "huasing.xml"),
    "utf8",
  );
  assert.match(huasing, /B=1_2/);
  assert.doesNotMatch(huasing, /B=1_3/);
});
