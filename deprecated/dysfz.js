var request = require('request');
var feed = require('feed');
var db = require('./dbpg');
var push = require('./push');

module.exports = dysfz;

var regex = /<h2><a target="_blank" href="(.+?)">(.+?)<\/a><\/h2>[\s\S]+?"des clearfix">([\s\S]+?)\s*<a class="pic fl"[\s\S]+?更新: <span>(.+?)<\/span>/g;
var regexArticle = /<div class="detail"[\s\S]+?<\/div>([\s\S]+)<div class="bdsharebuttonbox/g;

db();
var currentDate = new Date();

function dysfz (req) {
    request('http://www.dysfz.vip', function (error, response, body) {
        var userAgent = req.headers['user-agent'];
        var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

        if (error || (response && response.statusCode !== 200)) {
            console.log('error:', error);
            console.log('statusCode:', response && response.statusCode);
            console.log('body:', body);
        }

        var count = 0, countProceed = 0, countTotal;
        while (match = regex.exec(body)) {
            (function (theMatch) {
                var url = theMatch[1];
                // https://stackoverflow.com/questions/1499889/remove-html-tags-in-javascript-with-regex
                var title = theMatch[2] + theMatch[3].replace(/(<([^>]+)>)/ig, '');
                var articleDate = new Date(theMatch[4]);
                if (articleDate > currentDate) {
                    articleDate = currentDate;
                }
                console.log(url);
                count++;
                db.exists(url, function (exists) {
                    if (!exists) {
                        request(url, function (articleError, articleResponse, articleBody) {
                            console.log('get content ' + url);
                            if (error) {
                                return console.error('failed:', error);
                            }
                            articleBody = articleBody.replace(/style="[^"]{20,}?"/g, '');
                            if (articleMatch = regexArticle.exec(articleBody)) {
                                console.log(this.href);
                                var content = articleMatch[1];
                                db.movieNew([url, title, content, articleDate], function (rowCount) {
                                    console.log('rowCount ' + rowCount);
                                    push(title + '\n' + url);
                                });
                            }
                        });
                    }
                    countProceed++;
                    if (countProceed === countTotal) {
                        console.log('countTotal ' + countTotal);
                        // sent to another service
                        push(ip + ' ' + userAgent); // .slice(0, -2)
                    }
                });
            })(match);
        }
        countTotal = count++;
    });
}

dysfz.feed = function (req, res) {
    db.list(function (rows) {
        var userAgent = req.headers['user-agent'];
        var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

        console.log(ip + ' ' + userAgent + ' feed');
        var feedOut = new feed({
            title: 'dysfz',
            id: 'dysfz',
            updated: currentDate,
            favicon: 'https://qapla.herokuapp.com/favicon.ico'
        });

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

        var atom1 = feedOut.atom1();
        res.send(atom1);
    });
};

function getImage (content) {
    var imageMatch = /<img src="(.+?)".+?\/>/g.exec(content);
    var imgTag = ' ';
    if (imageMatch) {
        imgTag += imageMatch[0];
    }
    return imgTag;
}
