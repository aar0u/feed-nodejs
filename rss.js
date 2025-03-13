import { Feed } from 'feed';
import he from 'he';

export default async function(req, res) {
    let feedId = req.params.feedId;
    let cacheId = feedId + '_' + (req.params.params || '');

    let data = req.app.locals.listCache.get(cacheId);
    if (!data) {
        console.log(`${feedId}: Getting from remote`);
        try {
            //fake ctx to use rsshub source
            let ctx = {
                state: { data: null }, params: req.params.params,
                cache: req.app.locals.contentCache
            };

            let module;
            try {
                module = await import('./rss/' + feedId + '.js');
            } catch (error) {
                console.log(`未找到 ${feedId}.js (${ error.message})，尝试加载 ${feedId}.ts`);
                module = await import('./rss/' + feedId + '.ts');
            }
            data = await module.default(ctx);
            if (ctx.state.data) {
                data = ctx.state.data;
            }

            req.app.locals.listCache.set(cacheId, data);
        } catch (error) {
            console.error(`处理 ${feedId} 时发生错误:`, error);
            return res.status(500).json({
                error: '获取数据失败',
                message: error.message
            });
        }
    }

    let userAgent = req.headers['user-agent'];
    let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    console.log(`cacheId: ${cacheId}, item: ${data.item.length}, ua: ${userAgent}, ip: ${ip}`);

    // render by https://www.npmjs.com/package/feed
    // let rssOut = await generate(data);
    // res.type('application/xml; charset=utf-8');
    // res.send(rssOut);

    // render by template
    const feed = {
        lastBuildDate: new Date().toUTCString(),
        updated: new Date().toISOString(),
        ttl: 60, //mins
        atomlink: data.link,
        ...data,
    };
    res.render('rss.art', feed);
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
            description: obj.description && he.decode(obj.description),
            author: [{ name: obj.author }]
        });
    }

    return feed.rss2();
};
