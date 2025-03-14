import { parseList } from './zaobao/util.js';
const baseUrl = 'https://www.zaobao.com.sg';

export default async (ctx) => {
    const section = ctx.params;

    let sectionLink = '/';

    if (section === 'singapore') {
        sectionLink = '/news/singapore';
    } else if (section === 'world') {
        sectionLink = '/news/world';
    } else if (section === 'sea') {
        sectionLink = '/news/sea';
    } else if (section === 'sports') {
        sectionLink = '/news/sports';
    } else if (section === 'fukan') {
        sectionLink = '/news/fukan';
    }

    const { resultList } = await parseList(ctx, sectionLink);

    ctx.state.data = {
        title: `联合早报`,
        link: baseUrl + sectionLink,
        description: '新加坡、中国、亚洲和国际的即时、评论、商业、体育、生活、科技与多媒体新闻，尽在联合早报。',
        item: resultList,
    };
};