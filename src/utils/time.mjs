const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Singapore",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** @param {Date} date */
export function formatTimestamp(date) {
  const parts = Object.fromEntries(
    timestampFormatter
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}
