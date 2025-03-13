import got from '@/utils/got.js';
import cheerio from 'cheerio';

const baseUrl = 'https://www.zaobao.com.sg';
const got_ins = got.extend({
    headers: {
        Referer: baseUrl,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'Cookie': 'country=sg',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    },
    timeout: {
        request: 10000
    },
    retry: {
        limit: 3
    }
});

const parseList = async (ctx, sectionUrl) => {
    const response = await got_ins.get(baseUrl + sectionUrl);
    const $ = cheerio.load(response.data);
    
    console.log('Page URL:', baseUrl + sectionUrl);
    
    // 获取指定区域的新闻，包括今日要闻和推荐新闻，排除即时新闻
    const newsFeature = $('.news-feature-card').find('h2').closest('.card-content');
    const recommendedNews = $('#today-recommended-news-finance ul li');
    
    let data = $([...newsFeature.toArray(), ...recommendedNews.toArray()]).filter((_, el) => {
        return $(el).find('h2').length > 0 && !$(el).find('[data-testid^="test-realtime-article-card"]').length;
    });
    console.log('Found articles:', data.length);
    
    // 更新标题选择器
    const title = $('main h1').text().trim() || '新加坡新闻';
    
    const resultList = [];
    
    for (const item of data.toArray()) {
        const $item = $(item);
        const href = $item.find('a').first().attr('href');
        console.log('Found href:', href);
        const link = href ? (href.startsWith('http') ? href : baseUrl + href) : '';
        const itemTitle = $item.find('h2').text().trim();
        console.log('Found title:', itemTitle);

        const value = await ctx.cache.get(link);
        if (value) {
            resultList.push(JSON.parse(value));
            continue;
        }

        try {
            const article = await got_ins.get(link);
            const $1 = cheerio.load(article.data);
            
            // 更新时间获取和处理逻辑
            const timeText = $1('.timestamp').text().trim();
            let time;
            if (timeText.includes('小时前')) {
                const hours = parseInt(timeText);
                time = new Date(Date.now() - hours * 60 * 60 * 1000);
            } else if (timeText.includes('分钟前')) {
                const minutes = parseInt(timeText);
                time = new Date(Date.now() - minutes * 60 * 1000);
            } else {
                time = new Date();
            }

            // 更新图片处理逻辑
            let description = $1('.articleBody').html() || 
                            $1('.article-body-container').html() || 
                            $1('.article-content-container').html();
            
            // 移除广告内容
            if (description) {
                const $content = cheerio.load(description);
                $content('.bff-google-ad').remove();
                $content('.bff-recommend-article').remove();
                description = $content.html();
            }

            const sourceImg = $1('picture source').first().attr('srcset');
            if (sourceImg) {
                const imgUrl = sourceImg.split(',')[0].split(' ')[0];
                description = `<img src="${imgUrl}" />` + (description || '');
            }

            const resultItem = {
                title: itemTitle || $1('h1').text().trim(),
                description: description || '暂无内容',
                pubDate: time.toUTCString(),
                link: link,
            };
            
            await ctx.cache.set(link, JSON.stringify(resultItem));
            resultList.push(resultItem);
        } catch (error) {
            console.log('Error fetching article:', link, error.message);
        }
    }

    return {
        title: title,
        resultList: resultList,
    };
};

export {
    parseList,
};