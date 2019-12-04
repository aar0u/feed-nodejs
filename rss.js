var feed = require('feed');
var cache = require('./cache');

module.exports = rss;

async function rss(req, res) {
    console.log('feedId: ' + req.params.feedId);
    await require('./rss/' + req.params.feedId)();

    var userAgent = req.headers['user-agent'];
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    console.log(ip + ' ' + userAgent + ' feed');

    var atom1 = await generate();
    res.send(atom1);
}

async function generate() {
    var feedOut = new feed({
        title: 'dysfz',
        id: 'dysfz',
        updated: new Date(),
        favicon: 'https://qapla.herokuapp.com/favicon.ico'
    });

    rows = await cache.list();
    console.log(rows.length);
    for (var i = 0; i < rows.length; i++) {
        var obj = rows[i];
        feedOut.addItem({
            title: obj.title,
            id: obj.url,
            link: obj.url,
            content: obj.content,
            date: new Date(obj.updated),
            description: obj.title + getImage(obj.content)
        });
    }

    return feedOut.atom1();
};

function getImage(content) {
    var imageMatch = /<img src="(.+?)".+?\/>/g.exec(content);
    var imgTag = ' ';
    if (imageMatch) {
        imgTag += imageMatch[0];
    }
    return imgTag;
}
