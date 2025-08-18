import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import rss from './rss.js';
import initCache from './cache.js';

const app = express();

app.set('port', (process.env.PORT || 3000));
app.use(express.static(__dirname + '/public'));
// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

app.get('/', function (req, res) {
    const dummy_rows = [{
        name: 'Searching',
        name_cn: '网络谜踪',
        score: '8.9',
        url: 'https://movie.douban.com/subject/27615441/',
        updated: '2018-10-01T05:01:26.745Z',
        code: '73 1 156 221 195 34 156 171 119 44 223 76 197 194 68 65'
    }, {
        name: 'Smallfoot',
        name_cn: '雪怪大冒险',
        score: '7.5',
        url: 'https://movie.douban.com/subject/26944582/',
        updated: '2018-10-01T05:01:26.745Z',
        code: '203 160 147 221 66 185 25 239 141 28 233 73 73 128 55 29'
    }];

    res.render('pages/index.ejs', { rows: dummy_rows });
});

app.get('/feed', async (req, res) => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const rssDir = path.join(__dirname, 'rss');
    let files = await fs.readdir(rssDir, { withFileTypes: true });
    let feeds = [];

    for (const file of files) {
        if (file.isFile() && file.name.endsWith('.js')) {
            feeds.push(file.name.replace(/\.js$/, ''));
        }
    }

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Available Feeds</title></head><body>`;
    html += `<h1>Available Feeds</h1><ul>`;
    for (const feed of feeds) {
        html += `<li><a href="/feed/${feed}">${feed}</a></li>`;
    }
    html += `</ul></body></html>`;
    res.type('html').send(html);
});

app.get('/feed/:feedId/:params?', rss);

// cache
initCache(app);

app.listen(app.get('port'), function () {
    console.log('Node app is running on port', app.get('port'));
});
