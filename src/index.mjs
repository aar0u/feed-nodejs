import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Feed } from "feed";
import { log } from "./utils/log.mjs";
import { readPublishedFeed } from "./utils/published-feed.mjs";
import {
  absoluteUrls,
  extractContent,
  fetchDocument,
} from "./utils/parser.mjs";

/** @typedef {import("./source.d.ts").FeedEntryCandidate} FeedEntryCandidate */
/** @typedef {import("./source.d.ts").Source} Source */

const sourceDirectory = new URL("./sources/", import.meta.url);
const sourcePaths = (await readdir(sourceDirectory, { withFileTypes: true }))
  .sort((left, right) => left.name.localeCompare(right.name))
  .flatMap((entry) =>
    entry.isFile() && entry.name.endsWith(".mjs")
      ? [entry.name]
      : entry.isDirectory()
        ? [`${entry.name}/index.mjs`]
        : [],
  );
/** @type {Source[]} */
const sources = (
  await Promise.all(
    sourcePaths.map(
      async (path) =>
        (await import(new URL(path, sourceDirectory).href)).default,
    ),
  )
).flatMap((source) => (Array.isArray(source) ? source : [source]));
const feedEntryCandidateLimit = 20;
const entryHistoryLimit = 100;
const defaultContentFetchConcurrency = 5;
const publishedFeedDirectory = process.env.PUBLISHED_FEED_DIRECTORY;
const feedBaseUrl = process.env.FEED_BASE_URL;
const webSubHub = "https://pubsubhubbub.superfeedr.com/";

/** @param {string | Date | undefined} value */
function validDate(value) {
  const date = value && new Date(value);
  return date && !Number.isNaN(date.valueOf()) ? date : undefined;
}

/** @param {FeedEntryCandidate} candidate @returns {candidate is FeedEntryCandidate & { link: string, title: string }} */
function isFeedEntryCandidate(candidate) {
  return Boolean(candidate.link && candidate.title);
}

/** @param {Feed} feed @param {{ title: string, id: string, link: string, content: string, date?: string | Date }} entry */
function appendFeedEntry(feed, entry) {
  feed.addItem({
    title: entry.title,
    id: entry.id,
    link: entry.link,
    content: entry.content,
    date: validDate(entry.date) || new Date(),
  });
}

/** @param {Source} source */
async function generateFeed(source) {
  const startedAt = Date.now();
  const contentFetchConcurrency =
    source.contentFetchConcurrency ?? defaultContentFetchConcurrency;
  const requestDelay = source.requestDelay ?? 0;
  log(
    "INFO",
    `[${source.id}] generating (content fetch concurrency: ${contentFetchConcurrency}, request delay: ${requestDelay}ms)`,
  );
  const publishedFeed = await readPublishedFeed(
    publishedFeedDirectory
      ? join(publishedFeedDirectory, `${source.id}.xml`)
      : undefined,
  );
  const feedUrl =
    feedBaseUrl && new URL(`${source.id}.xml`, `${feedBaseUrl}/`).href;
  const feed = new Feed({
    title: source.title,
    description: source.description,
    id: source.link,
    link: source.link,
    ...(feedUrl && { feed: feedUrl, hub: webSubHub }),
    copyright: "",
    language: "zh-CN",
    updated: new Date(),
  });

  /** @type {import("./source.d.ts").FeedEntry[]} */
  const newEntries = [];
  let checkedCandidateCount = 0;
  let failed = false;
  try {
    const sourceDocument = source.fetchItems
      ? await source.fetchItems()
      : await fetchDocument(source.link, source.encoding);
    const candidateLinks = new Set();
    const candidates = (
      source.extractItems
        ? source.extractItems(/** @type {Document} */ (sourceDocument))
        : /** @type {FeedEntryCandidate[]} */ (sourceDocument)
    )
      .map((candidate) => ({
        ...candidate,
        link: candidate.link && new URL(candidate.link, source.link).href,
        contentUrl:
          candidate.contentUrl &&
          new URL(candidate.contentUrl, source.link).href,
      }))
      .filter(isFeedEntryCandidate)
      .filter(
        (candidate) =>
          !candidateLinks.has(candidate.link) &&
          candidateLinks.add(candidate.link),
      )
      .slice(0, feedEntryCandidateLimit);
    checkedCandidateCount = candidates.length;

    let nextCandidateIndex = 0;
    let nextRequestAt = 0;
    async function captureCandidateContent(candidate) {
      if (!candidate.link || !candidate.title)
        throw new Error("missing candidate link or title");
      if (candidate.content !== undefined)
        return {
          candidate,
          capturedContent: {
            ...candidate,
            content: absoluteUrls(candidate.content, candidate.link),
          },
        };
      const now = Date.now();
      const requestAt = Math.max(now, nextRequestAt);
      nextRequestAt = requestAt + requestDelay;
      if (requestAt > now)
        await new Promise((resolve) => setTimeout(resolve, requestAt - now));
      const contentUrl = candidate.contentUrl || candidate.link;
      const contentDocument = await fetchDocument(contentUrl, source.encoding);
      return {
        candidate,
        capturedContent: await extractContent(
          contentDocument,
          contentUrl,
          source,
        ),
      };
    }
    async function worker() {
      /** @type {PromiseSettledResult<{ candidate: FeedEntryCandidate, capturedContent: import("./source.d.ts").CapturedContent | null }>[] } */
      const results = [];
      while (nextCandidateIndex < candidates.length) {
        const candidate = candidates[nextCandidateIndex++];
        try {
          results.push({
            status: "fulfilled",
            value: await captureCandidateContent(candidate),
          });
        } catch (reason) {
          const url = candidate.contentUrl || candidate.link || "unknown URL";
          const message =
            reason instanceof Error ? reason.message : String(reason);
          results.push({
            status: "rejected",
            reason: new Error(`${url}: ${message}`),
          });
        }
      }
      return results;
    }
    const results = (
      await Promise.all(
        Array.from(
          { length: Math.min(contentFetchConcurrency, candidates.length) },
          worker,
        ),
      )
    ).flat();
    for (const result of results) {
      if (result.status !== "fulfilled" || !result.value.capturedContent) {
        if (result.status === "rejected")
          log(
            "ERROR",
            `[${source.id}] skipped article: ${result.reason.message}`,
          );
        continue;
      }
      const { candidate, capturedContent } = result.value;
      if (!candidate.link || !candidate.title) continue;
      const publishedPrimaryEntry = publishedFeed.entries.find(
        (entry) => entry.link === candidate.link,
      );
      if (!publishedPrimaryEntry) {
        newEntries.push({
          id: candidate.link,
          title: capturedContent.title || candidate.title,
          link: candidate.link,
          content: capturedContent.content,
          date: capturedContent.date || candidate.date,
        });
        continue;
      }
      if (source.buildChangeEntries) {
        const publishedChangeEntries = publishedFeed.entries.filter(({ id }) =>
          id.startsWith(`${candidate.link}#`),
        );
        newEntries.push(
          ...source.buildChangeEntries(capturedContent, candidate, {
            contents: [
              publishedPrimaryEntry.content,
              ...publishedChangeEntries.map(({ content }) => content),
            ],
          }),
        );
      }
    }
  } catch (error) {
    failed = true;
    log(
      "ERROR",
      `[${source.id}] skipped source: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (failed && publishedFeed.xml) {
    await writeFile(`public/${source.id}.xml`, publishedFeed.xml);
    return { id: source.id, changed: false };
  }

  newEntries.sort(
    (left, right) =>
      (validDate(right.date)?.valueOf() || 0) -
      (validDate(left.date)?.valueOf() || 0),
  );
  const feedEntries = [...newEntries, ...publishedFeed.entries]
    .filter(
      (entry, index, all) =>
        all.findIndex(({ id }) => id === entry.id) === index,
    )
    .slice(0, entryHistoryLimit);
  for (const entry of feedEntries) appendFeedEntry(feed, entry);
  await writeFile(`public/${source.id}.xml`, feed.rss2());
  log(
    "INFO",
    `[${source.id}] checked ${checkedCandidateCount} candidates; ${newEntries.length ? `wrote ${newEntries.length} new entries` : "no new entries"} in ${((Date.now() - startedAt) / 1000).toFixed(3)}s`,
  );
  return {
    id: source.id,
    changed: !publishedFeed.xml || newEntries.length > 0,
  };
}

await mkdir("public", { recursive: true });
const results = await Promise.allSettled(sources.map(generateFeed));
const changedFeeds = [];
for (const result of results) {
  if (result.status === "rejected")
    log("ERROR", `Failed to write feed: ${result.reason.message}`);
  else if (result.value.changed) changedFeeds.push(`${result.value.id}.xml`);
}
await writeFile(
  "public/index.html",
  `<!doctype html><meta charset="utf-8"><title>RSS feeds</title><ul>${sources.map((source) => `<li><a href="${source.id}.xml">${source.title}</a></li>`).join("")}</ul>`,
);
await writeFile("public/changed-feeds.txt", changedFeeds.join("\n"));
