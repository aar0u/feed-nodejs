const got = require('got');

const custom = got.extend({
    hooks: {
        afterResponse: [
            (response) => {
                try {
                    response.data = JSON.parse(response.body);
                } catch (e) {
                    response.data = response.body;
                }
                response.status = response.statusCode;
                return response;
            },
        ]
    }
});
custom.all = (list) => Promise.all(list);

module.exports = custom;