import { formatTimestamp } from "./time.mjs";

/** @param {"INFO" | "ERROR"} level @param {string} message */
export function log(level, message) {
  const entry = `[${formatTimestamp(new Date())}] ${level}: ${message}`;
  if (level === "ERROR") console.warn(`\u001b[31m${entry}\u001b[0m`);
  else console.log(entry);
}
