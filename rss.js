const feed = require('feed');

module.exports = async (req, res) => {
    let feedId = req.params.feedId;
    let cacheId = feedId + '_' + (req.params.params || '');

    let data = req.app.locals.cache.get(cacheId);
    if (!data) {
        console.log(`getting from remote ${cacheId}`);

        //fake ctx to use rsshub source
        let ctx = {
            state: {
                data: null
            },
            params: req.params.params,
            cache: {
                get: () => null,
                set: () => null,
                tryGet: async (key, getValueFunc) => {
                    return await getValueFunc();
                }
            }
        };

        data = await require('./rss/' + feedId)(ctx);
        if (ctx.state.data) {
            data = ctx.state.data;
        }

        req.app.locals.cache.set(cacheId, data);
    }

    let userAgent = req.headers['user-agent'];
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    console.log('feedId: ' + req.params.feedId + ', item count: ' + data.item.length
        + ', req: ' + ip + ' ' + userAgent);

    let atom1 = await generate(data);
    res.send(atom1);
}

async function generate(data) {
    let feedOut = new feed({
        generator: "awesome",
        title: data.title,
        author: {
            name: "qapla"
        },
        link: data.link,
        updated: new Date(),
        favicon: 'favicon.ico'
    });

    for (let i = 0; i < data.item.length; i++) {
        let obj = data.item[i];
        // refers to https://www.npmjs.com/package/feed
        feedOut.addItem({
            title: obj.title,
            link: obj.link,
            date: obj.date ? obj.date : new Date(obj.pubDate),
            description: obj.description
        });
    }

    return feedOut.atom1();
};
