import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** @param {string | undefined} directory @param {string} sourceId */
function statePath(directory, sourceId) {
  return directory && join(directory, ".feed-state", `${sourceId}.json`);
}

/** @param {string | undefined} directory @param {string} sourceId */
export async function readPendingChanges(directory, sourceId) {
  const path = statePath(directory, sourceId);
  if (!path) return {};
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return {};
    throw error;
  }
}

/** @param {string} directory @param {string} sourceId @param {object} pendingChanges */
export async function writePendingChanges(directory, sourceId, pendingChanges) {
  const path = statePath(directory, sourceId);
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(pendingChanges)}\n`);
}
