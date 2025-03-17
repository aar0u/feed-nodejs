async function test() {
  // console.log(
  //   "处理结果：\n",
  //   await (
  //     await import("../rss/zaobao/util.js")
  //   ).processArticle(
  //     "https://www.zaobao.com.sg/realtime/singapore/story20250315-6021604?ref=today-news-section-card-1",
  //     null
  //   )
  // );
  console.log(
    "处理结果：\n",
    await (
      await import("../rss/8world.js")
    ).processArticle(
      "https://www.8world.com/singapore/tourist-bus-with-23-singaporeans-capsized-in-malaysia-2733096",
      null
    )
  );
}

test().catch(console.error);
