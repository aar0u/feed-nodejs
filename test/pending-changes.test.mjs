import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  readPendingChanges,
  writePendingChanges,
} from "../src/utils/pending-changes.mjs";

test("pending changes persist per source", async () => {
  const directory = await mkdtemp(join(tmpdir(), "feed-"));
  const pendingChanges = {
    "https://example.com/story": {
      firstSeenAt: "2026-08-27T00:00:00.000Z",
      changeCandidates: [{ id: "comment-1" }],
    },
  };
  assert.deepEqual(await readPendingChanges(directory, "hackernews"), {});
  await writePendingChanges(directory, "hackernews", pendingChanges);
  assert.deepEqual(
    await readPendingChanges(directory, "hackernews"),
    pendingChanges,
  );
  await rm(directory, { recursive: true });
});
