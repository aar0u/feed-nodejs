module.exports = {
    list: function () {
        return [];
    },
    exists: function () {
        return false;
    },
    new: () => {
        console.log('new entry');
    }
};