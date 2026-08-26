/** @param {Document} document @param {Element} video */
export function brightcovePlayer(document, video) {
  const videoId = video.getAttribute("data-video-id");
  const account = video.getAttribute("data-account");
  const player = video.getAttribute("data-player");
  const embed = video.getAttribute("data-embed") || "default";
  if (!videoId || !account || !player) return undefined;

  const iframe = document.createElement("iframe");
  iframe.src = `https://players.brightcove.net/${encodeURIComponent(account)}/${encodeURIComponent(player)}_${encodeURIComponent(embed)}/index.html?videoId=${encodeURIComponent(videoId)}`;
  iframe.title = "Video player";
  iframe.width = "100%";
  iframe.height = "360";
  iframe.setAttribute("allow", "encrypted-media");
  iframe.setAttribute("allowfullscreen", "");
  return iframe;
}
