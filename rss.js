const Feed = require('feed').Feed;

module.exports = async (req, res) => {
    let feedId = req.params.feedId;
    let cacheId = feedId + '_' + (req.params.params || '');

    let data = req.app.locals.listCache.get(cacheId);
    if (!data) {
        console.log(`${feedId}: Getting from remote`);

        //fake ctx to use rsshub source
        let ctx = {
            state: { data: null }, params: req.params.params,
            cache: req.app.locals.contentCache
        };

        data = await require('./rss/' + feedId)(ctx);
        if (ctx.state.data) {
            data = ctx.state.data;
        }

        req.app.locals.listCache.set(cacheId, data);
    }

    let userAgent = req.headers['user-agent'];
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    console.log(`cacheId: ${cacheId}, item: ${data.item.length}, ua: ${userAgent}, ip: ${ip}`);

    let rssOut = await generate(data);
    res.type('application/xml; charset=utf-8');
    res.send(rssOut);
}

async function generate(data) {
    let feed = new Feed({
        title: data.title,
        description: data.description,
        link: data.link,
        author: { name: data.author },
        updated: new Date(),
        favicon: 'favicon.ico',
        generator: "Spotjoy"
    });

    for (let i = 0; i < data.item.length; i++) {
        let obj = data.item[i];
        // refers to https://www.npmjs.com/package/feed
        feed.addItem({
            title: obj.title,
            link: obj.link,
            date: obj.date ? obj.date : new Date(obj.pubDate),
            description: obj.description,
            author: [{ name: obj.author }]
        });
    }

    return feed.rss2();
};
