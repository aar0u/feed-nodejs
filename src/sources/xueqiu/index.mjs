import { hotPosts, userTimeline } from "./client.mjs";

/** @type {import("../../source.d.ts").Source[]} */
const sources = [
  {
    id: "xueqiu-3582153332",
    title: "雪球 · 美股研究社",
    link: "https://xueqiu.com/u/3582153332",
    description: "雪球用户 3582153332 的最新动态",
    fetchItems: () => userTimeline("3582153332"),
  },
  {
    id: "xueqiu-hots",
    title: "雪球热帖",
    link: "https://xueqiu.com",
    description: "雪球每日热门帖子",
    fetchItems: hotPosts,
  },
];

export default sources;
