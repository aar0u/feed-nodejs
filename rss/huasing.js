const { promisify } = require('util');
const got = require('got');
const iconv = require('iconv-lite');

const regex = /<div id="s-(.+?)".+?iv>(.+?)<\/(.+?\n){6}.+?,(.+?),(.*?\n){2}(.+?),/g;
// match for http://bbs.huasing.org/sForum/bbs.php?B= for content
// const contentRegex = /详细资料">(.+?)<\/.*?发表：(.+?:.{5}).*?subj-.+?>(.+?)<\/.+?fullc-">(.*?)<\/div><div class="mediate ft12">/gs;
const contentRegex = /zt\(\d+,(\d+),\d+,(\d+),'(.*?)',(\d+),'(.+?)'/gs;
const dateOption = {
    year: "2-digit", month: "numeric", day: "numeric",
    hour12: false, hour: "numeric", minute: "numeric"
};
const size = 20;

module.exports = async (ctx) => {
    try {
        console.log('request bId', ctx.params);

        let info = '华新鲜事';
        let url = 'http://bbs.huasing.org/sForum/zsbbs.php';

        if (ctx.params) {
            url = 'http://bbs.huasing.org/sForum/bbs.php?B=' + ctx.params;
            info = ctx.params;
        }
        if (179 == ctx.params) {
            info = '家有儿女';
        }
        if (172 == ctx.params) {
            info = '房产车市';
        }
        
        const { CookieJar } = require('tough-cookie');
        const cookieJar = new CookieJar();
        const setCookie = promisify(cookieJar.setCookie.bind(cookieJar));
        await setCookie('PHPSESSID=2a837c65baba27b4efcc833825be3bdf; PHPTYPE=A; PHPTIMEOUT=1575877130; SIGNATURE=8f502031a869ae59e152113daa6d5dc0', 'https://bbs.huasing.org');

        const response = await got(url, {
            cookieJar,
            encoding: 'binary'
        });
        const list = iconv.decode(response.body, 'GBK');

        const items = [];
        while (match = regex.exec(list)) {
            if (match[2].indexOf('[置顶]') !== -1) {
                continue;
            }

            const boardId = match[1].slice(0, match[1].indexOf('-'));
            const bId = match[1].replace('-', '_');
            const treeUrl = `http://bbs.huasing.org/sForum/ztree.php?B=${bId}`;
            const content = await ctx.cache.tryGet(treeUrl, async () => {
                let buf = await got(treeUrl, {
                    cookieJar,
                    encoding: 'binary'
                });
                return iconv.decode(buf.body, 'GBK');
            });

            const commentList = [];
            while (contentMatch = contentRegex.exec(content)) {
                const id = contentMatch[1];
                let detail = [...content.matchAll(new RegExp(`zc\\(${id},'(.+?)'`))];
                detail = detail[0] ? detail[0][1] : '';

                commentList.push({
                    id: `${boardId}_${id}`,
                    time: new Date(contentMatch[2] * 1000),
                    title: contentMatch[3],
                    userId: contentMatch[4],
                    user: contentMatch[5],
                    detail: detail.replace(/\u3000\u3000/g, '<br><br>')
                });
            }

            // shift out the first element - the topic
            const topic = commentList.shift();
            let description = constructComment(topic);
            let lastUpdate = topic.time;

            if (commentList.length) {
                commentList.sort((e1, e2) => e2.time < e1.time ? 1 : -1);
                lastUpdate = commentList[commentList.length - 1].time;
                for (let i = 0; i < commentList.length; i++) {
                    const element = commentList[i];
                    description += constructComment(element);
                }
            }

            items.push({
                title: `${match[2]} - ${lastUpdate.toLocaleString('en-US', dateOption)}`,
                link: `http://bbs.huasing.org/sForum/bbs.php?B=${bId}`,
                date: lastUpdate,
                description,
                author: match[4]
            });

            if (items.length === size) {
                break;
            }
        }

        return {
            title: `华新 - ${info}`,
            link: url,
            description: `华新 - ${info}`,
            item: items
        };
    } catch (error) {
        console.log(error);
        // console.log(error.response.body);
        //=> 'Internal server error ...'
    }
}

function constructComment(element) {
    const link = `http://bbs.huasing.org/sForum/bbs.php?B=${element.id}`;
    return `<p><font face="Microsoft Yahei"><b><font size="3"><a href="${link}">${element.title}</a></font></b><br>
    <font size="1">- <a href="http://bbs.huasing.org/sForum/user.php?B=${element.userId}">${element.user}</a>
    @ ${element.time.toLocaleString('en-US', dateOption)}</font><br>
    ${element.detail.replace('(more...)',`(<a href="${link}">more...</a>)`)}</font></p>`;
}