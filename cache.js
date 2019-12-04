const LRU = require('lru-cache');

module.exports = (app) => {
    const pageCache = new LRU({
        maxAge: 1000 * 60 * 60,
        max: 500,
    });

    app.locals.cache = {
        get: (key) => {
            if (key) {
                let value = pageCache.get(key);
                return value;
            }
        },
        set: (key, value) => {
            if (!value || value === 'undefined') {
                value = '';
            }
            // if (typeof value === 'object') {
            //     value = JSON.stringify(value);
            // }
            if (key) {
                return pageCache.set(key, value);
            }
        }
    };
};