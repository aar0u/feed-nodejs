import got from '../utils/got.js';
import * as cheerio from 'cheerio';

const baseUrl = 'https://www.8world.com';

export default async (ctx) => {
    const response = await got.get(baseUrl);
    const $ = cheerio.load(response.data);
    
    // 获取指定区域的新闻
    const targetSection = $('.layout--onecol.custom-row').first();
    const endSection = $('.layout--one-third-two-third.custom-row');
    let list = targetSection.nextUntil(endSection).find('article.article');
    if (list.length === 0) {
        list = targetSection.find('article.article');
    }
    console.log('Found items:', list.length);
    
    const items = await Promise.all(
        list.toArray().map(async (item) => {
            const $item = $(item);
            const href = $item.find('a.article-link').first().attr('href');
            console.log('Found href:', href);
            
            if (!href) {
                console.log('Skip invalid href $helf');
                return null;
            }
            
            const link = href.startsWith('http') ? href : baseUrl + href;
            const itemTitle = $item.find('.article-title a').text().trim();
            const timeStr = $item.find('time.time').attr('datetime');
            const imgSrc = $item.find('img.image').attr('src');
            
            // 提取所有分类和主题标签到一个数组中
            const categories = [];
            $item.find('.article-meta-ul li').each((_, el) => {
                const text = $(el).find('span').text().trim();
                if (text) {
                    categories.push(text);
                }
            });
            
            try {
                const article = await got.get(link);
                const $article = cheerio.load(article.data);
                
                // 获取文章内容
                let description = $article('.article-body p, .article-content p, .video-content p').map((_, el) => $(el).html()).get().join('');

                // 获取文章题图或视频封面
                let mediaHtml = '';
                const articleMedia = $article('figure.article-media');
                if (articleMedia.length > 0) {
                    mediaHtml = articleMedia.html() || '';
                    mediaHtml = mediaHtml.replace(/<figcaption/g, '<p class="media-caption"')
                                       .replace(/<\/figcaption>/g, '</p>');

                                       // if picture then change to use img tag
                    const articleImage = articleMedia.find('.article-image');
                    const caption = articleMedia.find('figcaption p').text().trim();
                    if (articleImage.length > 0) {
                        const bgImage = articleImage.attr('style');
                        const imgUrl = bgImage?.match(/url\('([^']+)'\)/)?.[1];
                        if (imgUrl) {
                            mediaHtml = `<img src="${imgUrl}"/>`;
                            if (caption) {
                                mediaHtml += `<p style="text-align: center; color: #666;">${caption}</p>`;
                            }
                        }
                    }
                    description = `<div class="article-media">${mediaHtml}</div>` + description;
                } else if (imgSrc) {
                    description = `<img src="${imgSrc}"/>` + description;
                }
                
                // 处理时间格式
                let pubDate = new Date();
                if (timeStr) {
                    const [date, time] = timeStr.split(' ');
                    const [day, month, year] = date.split('/');
                    const [hour, minute] = time.split(':');
                    pubDate = new Date(year, month - 1, day, hour, minute);
                }

                return {
                    title: itemTitle,
                    link,
                    description: description || '暂无内容',
                    pubDate: pubDate.toUTCString(),
                    category: categories,
                };
            } catch (error) {
                console.log('Error fetching article:', link, error.message);
                return null;
            }
        })
    ).then(items => items.filter(Boolean));

    ctx.state.data = {
        title: '8视界',
        link: baseUrl,
        description: '8视界首页',
        item: items,
    };
};