var express = require('express');
const moduleAlias = require('module-alias');
moduleAlias.addAlias('@', () => __dirname);

var app = express();

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));
// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

// art-template with express https://aui.github.io/art-template/express/
app.engine('art', require('express-art-template'));
app.set('view engine', 'art');

app.get('/', function (req, res) {
    dummy_rows = [{
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

var shaw = require('./shaw');
// routes from separated file
shaw.service(app);
app.get('/shaw', function (req, res) {
    
    shaw.getScore();

    shaw.feed(function (rows) {
        res.render('pages/index', { rows: rows });
    });
});

app.get('/dysfz', function (req, res) {
    var dysfz = require('./dysfz');

    // get update
    dysfz(req);

    // atom feed
    dysfz.feed(req, res);
});

app.get('/feed/:feedId/:params?', require('./rss'));

// cache
require('./cache')(app);

app.listen(app.get('port'), function () {
    console.log('Node app is running on port', app.get('port'));
});
