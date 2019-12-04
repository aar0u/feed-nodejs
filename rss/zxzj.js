const got = require('got');
var cache = require('../cache');

var regex = /<h2><a target="_blank" href="(.+?)">(.+?)<\/a><\/h2>[\s\S]+?"des clearfix">([\s\S]+?)\s*<a class="pic fl"[\s\S]+?更新: <span>(.+?)<\/span>/g;
var regexArticle = /<div class="detail"[\s\S]+?<\/div>([\s\S]+)<div class="bdsharebuttonbox/g;

var currentDate = new Date();

module.exports = async () => {
    try {
        console.log('in 111');

        const response = await got('https://www.zxzjs.com/');

        console.log('statusCode:', response && response.statusCode);
        // console.log('body:', response.body);

        var count = 0, countProceed = 0, countTotal;
        while (match = regex.exec(response.body)) {
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
                cache.exists(url, function (exists) {
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
                                cache.new([url, title, content, articleDate], function (rowCount) {
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

        // console.log(response.body);
        //=> '<!doctype html> ...'
    } catch (error) {
        console.log(error);
        // console.log(error.response.body);
        //=> 'Internal server error ...'
    }
}
