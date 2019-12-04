const got = require('got');

const title = '在线之家';
const url = 'https://www.zxzjs.com/';
const regex = /<a class="stui-vodlist__thumb lazyload" href="(.+?)" title="(.+?)" data-original="(.+?)".+?<span class="pic-text text-right">(.+?)<\/span><\/a>/g;

module.exports = async () => {
    try {
        const response = await got(url);

        console.log('statusCode:', response && response.statusCode);
        // console.log('body:', response.body);

        let items = [];

        while (match = regex.exec(response.body)) {
            items.push({
                title: match[2] + ' ' + match[4],
                link: url + match[1],
                date: new Date("01/01/2019"),
                description: '<img src="' + match[3] + '"/>',
            });
        }

        return {
            title: title,
            link: url,
            items: items
        };
    } catch (error) {
        console.log(error);
        // console.log(error.response.body);
        //=> 'Internal server error ...'
    }
}