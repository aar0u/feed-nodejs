const baseUrl = "https://wallstreetcn.com";
const apiUrl = "https://api-one.wallstcn.com";

async function article(resource) {
  const response = await fetch(`${apiUrl}/apiv1/content/articles/${resource.id}?extract=0`, { signal: AbortSignal.timeout(10_000) });
  const { data } = await response.json();
  const content = [data.content, data.content_more].filter(Boolean).join("");
  return {
    link: data.uri || resource.uri,
    title: data.title || data.content_text || resource.title,
    date: new Date(data.display_time * 1000),
    content,
  };
}

async function shares() {
  const response = await fetch(`${apiUrl}/apiv1/content/information-flow?channel=shares&accept=article&limit=20`, { signal: AbortSignal.timeout(10_000) });
  const { data } = await response.json();
  return Promise.all(data.items
    .filter((item) => item.resource_type === "article")
    .map((item) => article(item.resource)));
}

/** @type {import("../source.d.ts").Source} */
const source = {
  id: "wallstreetcn-shares",
  title: "华尔街见闻 · 股市",
  link: `${baseUrl}/news/shares`,
  description: "华尔街见闻股市资讯",
  fetchItems: shares,
};

export default source;
