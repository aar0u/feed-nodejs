import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Feed } from "feed";
import { log, pending, success } from "./utils/log.mjs";
import {
  readPendingChanges,
  writePendingChanges,
} from "./utils/pending-changes.mjs";
import { readPublishedFeed } from "./utils/published-feed.mjs";
import {
  absoluteUrls,
  extractContent,
  fetchDocument,
} from "./utils/parser.mjs";

/** @typedef {import("./source.d.ts").FeedEntryCandidate} FeedEntryCandidate */
/** @typedef {import("./source.d.ts").Source} Source */
/** @typedef {{ firstSeenAt: string, candidate: FeedEntryCandidate, capturedContent: import("./source.d.ts").CapturedContent, changeCandidates: import("./source.d.ts").FeedEntry[] }} PendingChange */

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
  const batchConfig =
    source.changeBatchSize && source.changeBatchDelay
      ? `; batch: ${source.changeBatchSize} changes / ${source.changeBatchDelay / 3_600_000}h`
      : "";
  log(
    "INFO",
    `[${source.id}] generating (fetch ×${contentFetchConcurrency}; delay: ${requestDelay}ms${batchConfig})`,
  );
  const publishedFeed = await readPublishedFeed(
    publishedFeedDirectory
      ? join(publishedFeedDirectory, `${source.id}.xml`)
      : undefined,
  );
  const changeBatchSize = source.changeBatchSize || 0;
  const changeBatchDelay = source.changeBatchDelay || 0;
  const batchesChanges = Boolean(
    changeBatchSize &&
    changeBatchDelay &&
    source.filterChangeCandidates &&
    source.buildChangeEntries,
  );
  /** @type {Record<string, PendingChange>} */
  const pendingChanges = batchesChanges
    ? await readPendingChanges(publishedFeedDirectory, source.id)
    : {};
  const pendingChangesJson = JSON.stringify(pendingChanges);
  const processedPendingLinks = new Set();
  const pendingChangeCount = () =>
    Object.values(pendingChanges).reduce(
      (count, pendingChange) => count + pendingChange.changeCandidates.length,
      0,
    );
  log(
    "INFO",
    `[${source.id}] loaded ${publishedFeed.entries.length} published entries`,
  );
  if (batchesChanges)
    log(
      "INFO",
      `[${source.id}] loaded ${Object.keys(pendingChanges).length} pending threads (${pendingChangeCount()} changes; threshold: ${changeBatchSize} changes or ${changeBatchDelay / 3_600_000}h)`,
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
  let existingCandidateCount = 0;
  let newPrimaryCount = 0;
  let skippedCandidateCount = 0;
  let queuedChangeCount = 0;
  let emittedBatchCount = 0;
  let emittedBatchChangeCount = 0;
  let failed = false;
  function logGenerationSummary() {
    const newPrimaryLabel = `${newPrimaryCount} new primary item${newPrimaryCount === 1 ? "" : "s"}`;
    const candidateCounts = [
      `${existingCandidateCount} existing`,
      ...(newPrimaryCount ? [newPrimaryLabel] : []),
      ...(skippedCandidateCount ? [`${skippedCandidateCount} skipped`] : []),
    ].join(", ");
    const updateCount = newEntries.length - newPrimaryCount;
    const publication = newEntries.length
      ? `; ${success(
          `published ${newEntries.length} RSS ${newEntries.length === 1 ? "entry" : "entries"} (${[
            ...(newPrimaryCount ? [newPrimaryLabel] : []),
            ...(updateCount
              ? [`${updateCount} update${updateCount === 1 ? "" : "s"}`]
              : []),
          ].join(", ")})`,
        )}`
      : "";
    log(
      "INFO",
      `[${source.id}] checked ${checkedCandidateCount} candidates (${candidateCounts})${publication} in ${((Date.now() - startedAt) / 1000).toFixed(3)}s`,
    );
    if (batchesChanges)
      log(
        "INFO",
        `[${source.id}] batch: ${pending(`queued ${queuedChangeCount} changes`)}; ${success(`published ${emittedBatchCount} thread updates containing ${emittedBatchChangeCount} changes`)}; ${pending(`pending ${pendingChangeCount()} changes across ${Object.keys(pendingChanges).length} threads`)}`,
      );
  }
  try {
    log("INFO", `[${source.id}] requesting source items`);
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
    log(
      "INFO",
      `[${source.id}] discovered ${checkedCandidateCount} candidates`,
    );
    const contentRequestCount = candidates.filter(
      (candidate) => candidate.content === undefined,
    ).length;
    if (contentRequestCount)
      log(
        "INFO",
        `[${source.id}] requesting content for ${contentRequestCount} candidates`,
      );

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
        skippedCandidateCount += 1;
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
        (entry) => entry.id === candidate.link,
      );
      if (!publishedPrimaryEntry) {
        newPrimaryCount += 1;
        newEntries.push({
          id: candidate.link,
          title: capturedContent.title || candidate.title,
          link: candidate.link,
          content: capturedContent.content,
          date: capturedContent.date || candidate.date,
        });
        continue;
      }
      existingCandidateCount += 1;
      if (source.filterChangeCandidates && source.buildChangeEntries) {
        const publishedChangeEntries = publishedFeed.entries.filter(({ id }) =>
          id.startsWith(`${candidate.link}#`),
        );
        const changeCandidates = source.filterChangeCandidates(
          capturedContent,
          {
            contents: [
              publishedPrimaryEntry.content,
              ...publishedChangeEntries.map(({ content }) => content),
            ],
          },
        );
        if (!batchesChanges) {
          newEntries.push(
            ...source.buildChangeEntries(
              capturedContent,
              candidate,
              changeCandidates,
            ),
          );
          continue;
        }

        processedPendingLinks.add(candidate.link);
        const pendingChange = pendingChanges[candidate.link];
        const pendingIds = new Set(
          pendingChange?.changeCandidates.map((change) => change.id),
        );
        const newChanges = changeCandidates.filter(
          (change) => !pendingIds.has(change.id),
        );
        queuedChangeCount += newChanges.length;
        const changes = [
          ...(pendingChange?.changeCandidates || []),
          ...newChanges,
        ];
        if (!changes.length) continue;
        const firstSeenAt =
          pendingChange?.firstSeenAt || new Date().toISOString();
        const batchExpired =
          Date.now() - new Date(firstSeenAt).valueOf() >= changeBatchDelay;
        if (changes.length >= changeBatchSize || batchExpired) {
          emittedBatchCount += 1;
          emittedBatchChangeCount += changes.length;
          newEntries.push(
            ...source.buildChangeEntries(capturedContent, candidate, changes),
          );
          delete pendingChanges[candidate.link];
        } else {
          pendingChanges[candidate.link] = {
            firstSeenAt,
            candidate,
            capturedContent,
            changeCandidates: changes,
          };
        }
      }
    }
    if (batchesChanges && source.buildChangeEntries) {
      for (const [link, pendingChange] of Object.entries(pendingChanges)) {
        if (
          processedPendingLinks.has(link) ||
          Date.now() - new Date(pendingChange.firstSeenAt).valueOf() <
            changeBatchDelay
        )
          continue;
        emittedBatchCount += 1;
        emittedBatchChangeCount += pendingChange.changeCandidates.length;
        newEntries.push(
          ...source.buildChangeEntries(
            pendingChange.capturedContent,
            pendingChange.candidate,
            pendingChange.changeCandidates,
          ),
        );
        delete pendingChanges[link];
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
    return { id: source.id, changed: false, stateChanged: false };
  }

  const stateChanged =
    batchesChanges && JSON.stringify(pendingChanges) !== pendingChangesJson;
  if (stateChanged)
    await writePendingChanges("public", source.id, pendingChanges);
  if (!newEntries.length && publishedFeed.xml) {
    await writeFile(`public/${source.id}.xml`, publishedFeed.xml);
    logGenerationSummary();
    return { id: source.id, changed: false, stateChanged };
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
  logGenerationSummary();
  return {
    id: source.id,
    changed: !publishedFeed.xml || newEntries.length > 0,
    stateChanged,
  };
}

await mkdir("public", { recursive: true });
const results = await Promise.allSettled(sources.map(generateFeed));
const changedFeeds = [];
let stateChanged = false;
for (const result of results) {
  if (result.status === "rejected")
    log("ERROR", `Failed to write feed: ${result.reason.message}`);
  else {
    if (result.value.changed) changedFeeds.push(`${result.value.id}.xml`);
    if (result.value.stateChanged) stateChanged = true;
  }
}
await writeFile(
  "public/index.html",
  `<!doctype html><meta charset="utf-8"><title>RSS feeds</title><ul>${sources.map((source) => `<li><a href="${source.id}.xml">${source.title}</a></li>`).join("")}</ul>`,
);
await writeFile("public/changed-feeds.txt", changedFeeds.join("\n"));
await writeFile("public/state-changed.txt", stateChanged ? "true\n" : "");
