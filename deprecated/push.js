var request = require('request');
var time = require('./utils/time');
var db = require('./dbpg');

module.exports = function (newNoti) {
    // skip notification
    return;
    let sendNoti = function (row) {
        var now = new Date();
        var newContent = { [time.local()]: newNoti };
        var array = [];
        if (row) {
            var diffHours = (now - row.date_added) / 3600000;
            array = JSON.parse(row.content);
            console.log(array);
            array.push(newContent);
            db.notiUpdate(row.date_added, JSON.stringify(array));
            var content = array.map(function (x) {
                var key = Object.keys(x)[0];
                return key + ':\n' + x[key];
            }).join('\n\n');
            console.log('diffHours: ' + diffHours + ', out: \n' + content);
            if (diffHours > 4) {
                pushBullet('qapla', content);
                db.notiNew(now, '[]');
            }
        }
        else {
            array.push(newContent);
            db.notiNew(now, JSON.stringify(array));
        }
    };
    db.notiLast(sendNoti);
};

function pushBullet(title, content) {
    var options = {
        url: 'https://api.pushbullet.com/v2/pushes',
        headers: {
            'Access-Token': '',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: title,
            type: 'note',
            body: content
        })
    };
    var r = request.post(options, function (error, response, body) {
        if (error || (response && response.statusCode !== 200)) {
            console.log('error:', error); // Print the error if one occurred
            console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
        }
        console.log('body:', body);
    });
}
