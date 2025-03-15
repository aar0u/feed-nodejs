async function test() {
  console.log(
    "处理结果：\n",
    await (
      await import("../rss/zaobao/util.js")
    ).processArticle(
      "https://www.zaobao.com.sg/realtime/singapore/story20250315-6021604?ref=today-news-section-card-1",
      null
    )
  );
//   console.log(
//     "处理结果：\n",
//     await (
//       await import("../rss/8world.js")
//     ).processArticle(
//       "https://www.8world.com/singapore/athanasius-pang-navigating-life-through-difficult-moments-2731791",
//       null
//     )
//   );
}

test().catch(console.error);
