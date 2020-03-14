const { promisify } = require('util');
const got = require('got');
const iconv = require('iconv-lite');

const title = '华新 - 华新鲜事';
const url = 'http://bbs.huasing.org/sForum/zsbbs.php';
const regex = /<div id="s-(.+?)".+?iv>(.+?)<\/(.+?\n){6}.+?,(.+?),(.*?\n){2}(.+?),/g;
// match for http://bbs.huasing.org/sForum/bbs.php?B=
// const contentRegex = /详细资料">(.+?)<\/.*?发表：(.+?:.{5}).*?subj-.+?>(.+?)<\/.+?fullc-">(.*?)<\/div><div class="mediate ft12">/gs;
const contentRegex = /zt\(\d+,(\d+),\d+,(\d+),'(.*?)',(\d+),'(.+?)'/gs;
const dateOption = {
    year: "2-digit", month: "numeric", day: "numeric",
    hour12: false, hour: "numeric", minute: "numeric"
};
const size = 20;

module.exports = async (ctx) => {
    try {
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
                lastUpdate = commentList[0].time;
                for (let i = 0; i < commentList.length; i++) {
                    const element = commentList[i];
                    description += constructComment(element);
                }
            }

            items.push({
                title: `${match[2]} - ${lastUpdate.toLocaleString('en-US', dateOption)}`,
                link: `http://bbs.huasing.org/sForum/bbs.php?B=${bId}`,
                date: lastUpdate,
                description: `<style>
                p {
                    margin: 0;
                  }
                  
                  a {
                    color: #006bb8;
                    text-decoration: none;
                  }
                  
                  a:hover {
                    text-decoration: underline;
                  }
                  
                  .entry-wrapper {
                    background: #e7e7e7;
                    border: 3px solid #f1f1f1;
                    border-radius: 5px;
                    display: inline-block;
                    font-family: "Microsoft Yahei",Tahoma, Helvetica, Arial;
                    margin: .25em;
                    padding: 10px;
                    width: 90%;
                  }
                  
                  .entry-wrapper:hover {
                    border: 3px solid #f4f4f4;
                    background: #edfdff;
                  }
                  
                  .entry-title a {
                    color: #333;
                    font-size: 1.5em;
                    font-weight: bold;
                  }
                  
                  .entry-date {
                    color: #999;
                    padding-bottom: .75em;
                    font-size: .75em;
                  }
                </style>${description}`,
                author: match[4]
            });

            if (items.length === size) {
                break;
            }
        }

        return {
            title,
            link: url,
            description: title,
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
    return `<div class="entry-wrapper"><p class="entry-title"><a href="${link}">${element.title}</a></p>
    <p class="entry-date">- <a href="http://bbs.huasing.org/sForum/user.php?B=${element.userId}">${element.user}</a>
    @ ${element.time.toLocaleString('en-US', dateOption)}</p>
    ${element.detail.replace('(more...)',`(<a href="${link}">more...</a>)`)}</div>`;
}