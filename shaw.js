var request = require('request');
var db = require('./dbpg');
var push = require('./push');

var regexList = /<option value="(.+?)">\s+([\s\S]+?)\s+<\/option>/g;

module.exports = {
    service: function (app) {
        app.get('/shaw', function (req, res) {
            module.exports.getScore();
            res.send('ok');
        });

        // other routes..
    },
    getScore: function () {
        var currentDate = new Date();
        request('http://shaw.sg/sw_movie.aspx', function (error, response, body) {
            temp = /<select name="FilmCode"[\s\S]+?<\/select>/g.exec(body);
            if (!temp) {
                console.log('no match on shaw: ' + temp);
                return;
            }
            body = temp[0];

            var matches = {};
            while (match = regexList.exec(body)) {
                matches[match[2].replace(/(\s*\[([^>]+)])/ig, '')] = match[1];
            }

            // only unique
            // var nameMatches = array.filter(function (value, index, self) {
            //     return self.indexOf(value) === index;
            // });

            for (var key in matches) {
                if (!{}.hasOwnProperty.call(matches, key)) {
                    continue;
                }
                (function (name) {
                    request('http://api.douban.com/v2/movie/search?q=' + name, function (errorDouban, responseDouban, bodyDouban) {
                        if (errorDouban || (responseDouban && responseDouban.statusCode !== 200)) {
                            console.log('error:', errorDouban);
                            console.log('statusCode:', responseDouban && responseDouban.statusCode);
                        }
                        var jsonObj;
                        try {
                            jsonObj = JSON.parse(bodyDouban);
                        } catch (e) {
                            console.error(bodyDouban, e);
                            return;
                        }
                        if (typeof jsonObj.subjects === 'undefined' || jsonObj.subjects.length == 0) {
                            console.log('no subjects:', bodyDouban);
                            return;
                        }
                        var info = jsonObj.subjects.filter(function (subject) {
                            return subject.year >= currentDate.getFullYear() - 1; // filter out older than last year
                        })[0];

                        if (typeof info === 'undefined') {
                            console.log('no subjects from last year:', name, bodyDouban);
                            return;
                        }

                        var params = [name, info.title, info.rating.average, info.alt, matches[name], currentDate];
                        // console.log(params.join('\n'));
                        // return;

                        db.shawUpdate(params.slice(0, -1), function (updated) {
                            var pushMsg = params.slice(0, -2).join('\n');
                            if (updated) {
                                console.log('update ' + params);
                                push(pushMsg);
                            } else {
                                db.shawNew(params, function (rowCount) {
                                    if (rowCount === 1) {
                                        console.log('new movie ' + params);
                                        push(pushMsg);
                                    } else {
                                        console.log('no update ' + params);
                                    }
                                });
                            }
                        });
                    });
                })(key);
            }
        });
    },
    feed: function (callback) {
        db.shawList(callback);
    }
};
