import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readPublishedFeed } from "../src/utils/published-feed.mjs";

test("readPublishedFeed preserves RSS entry fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "feed-"));
  const path = join(directory, "feed.xml");
  await writeFile(
    path,
    '<?xml version="1.0"?><rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item><title>Title</title><guid>https://example.com/id</guid><link>https://example.com/link</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate><content:encoded><![CDATA[<p>Body</p>]]></content:encoded></item></channel></rss>',
  );
  const feed = await readPublishedFeed(path);
  assert.deepEqual(feed.entries, [
    {
      id: "https://example.com/id",
      title: "Title",
      link: "https://example.com/link",
      content: "<p>Body</p>",
      date: new Date("2024-01-01T00:00:00.000Z"),
    },
  ]);
  await rm(directory, { recursive: true });
});
