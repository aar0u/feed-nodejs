import { formatTimestamp } from "./time.mjs";

/** @param {string} message */
export function success(message) {
  return `\u001b[1;92m${message}\u001b[0m`;
}

/** @param {string} message */
export function pending(message) {
  return `\u001b[1;93m${message}\u001b[0m`;
}

/** @param {"INFO" | "ERROR"} level @param {string} message */
export function log(level, message) {
  const entry = `[${formatTimestamp(new Date())}] ${level}: ${message}`;
  if (level === "ERROR") console.warn(`\u001b[1;91m${entry}\u001b[0m`);
  else console.log(entry);
}
