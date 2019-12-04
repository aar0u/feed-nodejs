exports.local = function (dateStr) {
    var date;
    if (dateStr) {
        date = new Date(dateStr);
    } else {
        date = new Date();
    }
    return date.toLocaleString('en-US', {
        timeZone: 'Asia/Singapore',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).replace(/\//g, '-');
};