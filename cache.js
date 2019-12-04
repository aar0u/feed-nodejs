const LRU = require('lru-cache');

const listCacheSec = 2 * 60;
const contentCacheSec = 60 * 60;

module.exports = (app) => {
    const listCache = new LRU({
        maxAge: listCacheSec * 60 * 1000,
        max: 100,
    });
    const contentCache = new LRU({
        maxAge: contentCacheSec * 60 * 1000,
        max: 500,
    });

    app.locals.listCache = {
        get: (key) => {
            if (key) {
                let value = listCache.get(key);
                return value;
            }
        },
        set: (key, value) => {
            console.log(`${key} cached in list`);
            if (!value || value === 'undefined') {
                value = '';
            }
            // if (typeof value === 'object') {
            //     value = JSON.stringify(value);
            // }
            if (key) {
                return listCache.set(key, value);
            }
        }
    };

    app.locals.contentCache = {
        get: (key) => {
            if (key) {
                let value = contentCache.get(key);
                return value;
            }
        },
        set: (key, value) => {
            console.log(`${key} cached in content`);
            if (!value || value === 'undefined') {
                value = '';
            }
            if (key) {
                return contentCache.set(key, value);
            }
        },
        tryGet: async (key, getValueFunc, maxAge = contentCacheSec) => {
            let v = await contentCache.get(key);
            if (!v) {
                v = await getValueFunc();
                contentCache.set(key, v, maxAge);
            } else {
                let parsed;
                try {
                    parsed = JSON.parse(v);
                } catch (e) {
                    parsed = null;
                }
                if (parsed) {
                    v = parsed;
                }
            }
            return v;
        }
    };
};