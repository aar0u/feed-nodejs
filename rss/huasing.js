const { promisify } = require('util');
const got = require('got');
var iconv = require('iconv-lite');

const title = '华新';
const url = 'http://bbs.huasing.org/sForum/zsbbs.php';
const regex = /<div id="s-(.+?)".+?iv>(.+?)<\/(.+?\n){6}.+?,(.+?),(.*?\n){2}(.+?),/g;
const contentRegex = /详细资料">(.+?)<\/.*?发表：(.+?:.{5}).*?subj-.+?>(.+?)<\/.+?fullc-">(.*?)<\/div><div class="mediate ft12">/gs
const size = 20;

module.exports = async (ctx) => {
    try {
        const { CookieJar } = require('tough-cookie');
        const cookieJar = new CookieJar();
        const setCookie = promisify(cookieJar.setCookie.bind(cookieJar));
        await setCookie('PHPSESSID=2a837c65baba27b4efcc833825be3bdf; PHPTYPE=A; PHPTIMEOUT=1575877130; SIGNATURE=8f502031a869ae59e152113daa6d5dc0', 'https://bbs.huasing.org');

        let response = await got(url, {
            cookieJar,
            encoding: 'binary'
        });
        let list = iconv.decode(response.body, 'GBK');

        let items = [];
        for (let i = 0; i < size; i++) {
            match = regex.exec(list);
            let link = `http://bbs.huasing.org/sForum/bbs.php?B=${match[1].replace('-', '_')}`;
            let content = await ctx.cache.tryGet(link, async () => {
                let buf = await got(link, {
                    cookieJar,
                    encoding: 'binary'
                });
                return iconv.decode(buf.body, 'GBK');
            });

            let description = '';
            while (contentMatch = contentRegex.exec(content)) {
                description += `- ${contentMatch[2]}@${contentMatch[1]}:<br>${contentMatch[3]} | ${contentMatch[4]}<br>
                ----------------------------------<br>`;
            }

            items.push({
                title: match[2],
                link,
                date: new Date(match[6]),
                description,
                author: match[4]
            });
        }

        return {
            title: title,
            link: url,
            description: '华新 - 华新鲜事',
            item: items
        };
    } catch (error) {
        console.log(error);
        // console.log(error.response.body);
        //=> 'Internal server error ...'
    }
}