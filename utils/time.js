export const local = (dateStr) => {
    const date = dateStr ? new Date(dateStr) : new Date();
    
    return date.toLocaleString('en-US', {
        timeZone: 'Asia/Singapore',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).replace(/\//g, '-');
};