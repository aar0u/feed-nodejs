import { readFile } from "node:fs/promises";
import { DOMParser } from "linkedom";

/** @typedef {{ id: string, title: string, link: string, content: string, date?: Date }} PublishedFeedEntry */
/** @typedef {{ xml: string | undefined, entries: PublishedFeedEntry[] }} PublishedFeed */

/** @param {string | undefined} path @returns {Promise<PublishedFeed>} */
export async function readPublishedFeed(path) {
  if (!path) return { xml: undefined, entries: [] };
  try {
    const xml = await readFile(path, "utf8");
    const document = new DOMParser().parseFromString(xml, "text/xml");
    /** @type {PublishedFeedEntry[]} */
    const entries = [...document.querySelectorAll("item")].flatMap((node) => {
      const id = node.querySelector("guid")?.textContent;
      const title = node.querySelector("title")?.textContent;
      const link = node.querySelector("link")?.textContent;
      const content = node.querySelector("content\\:encoded")?.textContent;
      const date = node.querySelector("pubDate")?.textContent;
      if (!id || !title || !link || content === undefined) return [];
      const parsedDate = date && new Date(date);
      return [
        {
          id,
          title,
          link,
          content,
          ...(parsedDate && !Number.isNaN(parsedDate.valueOf())
            ? { date: parsedDate }
            : {}),
        },
      ];
    });
    return { xml, entries };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return { xml: undefined, entries: [] };
    throw error;
  }
}
