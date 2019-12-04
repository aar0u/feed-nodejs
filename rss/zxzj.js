const got = require('got');

const title = '在线之家';
const url = 'https://www.zxzjs.com';
const regex = /<a class="stui-vodlist__thumb lazyload" href="(.+?)" title="(.+?)" data-original="(.+?)".+?<span class="pic-text text-right">(.+?)<\/span><\/a>/g;

module.exports = async () => {
    try {
        const response = await got(url);

        console.log('statusCode:', response && response.statusCode);
        // console.log('body:', response.body);

        let items = [];

        while (match = regex.exec(response.body)) {
            items.push({
                title: `${match[2]} ${match[4]}`,
                link: url + match[1],
                date: new Date(),
                description: `<img src="${match[3]}"/>
                <p>在线: <a href="${url + match[1]}">${url + match[1]}</a></p>
                <p>豆瓣: <a href="https://search.douban.com/movie/subject_search?search_text=${match[2]}">${match[2]}</a></p>`,
            });
        }

        return {
            title: title,
            link: url,
            description: '',
            item: items
        };
    } catch (error) {
        console.log(error);
        // console.log(error.response.body);
        //=> 'Internal server error ...'
    }
}