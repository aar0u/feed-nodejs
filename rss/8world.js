const got = require('@/utils/got');
const baseUrl = 'https://www.8world.com';

module.exports = async (ctx) => {
    const response = await got.get(`${baseUrl}/jsonapi/node/article?filter[category-filter][condition][operator]==&filter[category-filter][condition][path]=field_category.field_path&filter[category-filter][condition][value]=/singapore&sort=-field_published,-nid&page[offset]=0&page[limit]=10&include=field_category,field_category.parent,field_sponsor,field_cover_file,field_cover_video,field_cover_video.field_image,field_cover_video.field_image.field_media_image
    ,field_content`);
    // to add field_content so list will contains content body

    const list = response.data.data;

    const items = await Promise.all(list.map(async (e) => {
        let coverId;
        if (e.relationships.field_cover.data) {
            if (e.relationships.field_cover.data.type === 'paragraph--video') {
                coverId = e.relationships.field_cover_video.data.id;
            } else if (e.relationships.field_cover.data.type === 'paragraph--image') {
                coverId = e.relationships.field_cover_file.data.id;
            }
        }
        let contentId = e.relationships.field_content.data.filter(e => {
            return e.type === 'paragraph--text';
        })[0].id;

        let description = '';
        response.data.included.forEach(element => {
            if (element.id == contentId) {
                description = description + element.attributes.field_body.processed;
            }
            if (element.id == coverId) {
                if (element.type === 'media--ooyala') {
                    description = `<p><img src="${element.attributes.field_thumbnail}"/></p><video width="100%" controls>
                    <source src="${element.attributes.field_stream_file_name}" type="video/mp4"></video>`
                        + description;
                } else {
                    description = `<p><img src="${element.attributes.uri.url}"/></p>` + description;
                }
            }
        });

        const article = {
            title: e.attributes.title,
            link: `${baseUrl}/news/singapore/article${e.attributes.field_path}`,
            description: description,
            pubDate: new Date(e.attributes.changed * 1000)
        };

        return Promise.resolve(article);
    })
    );

    ctx.state.data = {
        title: `8频道新闻 - 新加坡`,
        link: baseUrl,
        description: '',
        item: items,
    };
};