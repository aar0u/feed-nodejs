const feed = require('feed');

module.exports = async (req, res) => {
    let feedId = req.params.feedId;

    let data = req.app.locals.cache.get(feedId);
    if (!data) {
        console.log('refresh cache');
        data = await require('./rss/' + feedId)();
        req.app.locals.cache.set(feedId, data);
    }

    let userAgent = req.headers['user-agent'];
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    console.log('feedId: ' + req.params.feedId + ', item count: ' + data.items.length
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

    for (let i = 0; i < data.items.length; i++) {
        let item = data.items[i];
        // item refers to https://www.npmjs.com/package/feed
        feedOut.addItem(item);
    }

    return feedOut.atom1();
};
