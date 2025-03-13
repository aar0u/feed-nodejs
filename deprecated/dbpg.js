var pg = require('pg');

module.exports = db;

pg.defaults.ssl = true;
var pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

function db () {
}

db.exists = function (url, callback) {
    pool.query('SELECT 1 FROM movies WHERE url=$1', [url], function (err, res) {
        if (err) {
            console.log(err.stack);
        } else {
            callback(res.rowCount !== 0);
        }
    });
};

db.movieNew = function (params, callback) {
    pool.query('INSERT INTO movies(url, title, content, updated) SELECT $1, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM movies WHERE url=$1);',
        params, function (err, res) {
            if (err) {
                console.log(err.stack);
            } else if (res.rowCount > 0) {
                callback(res.rowCount);
            }
        });
};

db.list = function (callback) {
    pool.query('SELECT * FROM movies ORDER BY updated DESC LIMIT 15;', function (err, result) {
        if (err) {
            console.log(err.stack);
        } else {
            callback(result.rows);
        }
    });
};

db.shawUpdate = function (params, callback) {
    pool.query('UPDATE shaw SET name_cn=$2, score=$3, url=$4, code=$5 WHERE name=$1 and score!=$3', params, function (err, res) {
        if (err) {
            console.log(err.stack);
        } else {
            callback(res.rowCount !== 0);
        }
    });
};

db.shawNew = function (params, callback) {
    var sqlInsert = 'INSERT INTO shaw(name, name_cn, score, url, code, updated) SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS (SELECT 1 FROM shaw WHERE name=$1);';
    pool.query(sqlInsert, params, function (err, res) {
        if (err) {
            console.log(err.stack);
        } else {
            callback(res.rowCount);
        }
    });
};

db.shawList = function (callback) {
    pool.query('SELECT * FROM shaw ORDER BY updated DESC LIMIT 15;', function (err, result) {
        if (err) {
            console.log(err.stack);
        } else {
            callback(result.rows);
        }
    });
};

db.notiList = function (callback) {
    pool.query('SELECT * FROM notification ORDER BY date_added DESC', function (err, result) {
        if (err) {
            console.log(err.stack);
        } else if (typeof callback === 'function') {
            callback(result.rows);
        }
    });
};

db.notiLast = function (callback) {
    pool.query('SELECT * FROM notification ORDER BY date_added DESC LIMIT 1;', function (err, result) {
        if (err) {
            console.log(err.stack);
        } else {
            callback(result.rows[0]);
        }
    });
};

db.notiNew = function (date, content, callback) {
    pool.query('INSERT INTO notification VALUES ($1, $2);', [date, content], function (err, result) {
        if (err) {
            console.log(err.stack);
        } else if (typeof callback === 'function') {
            callback(result.rowCount);
        }
    });
};

db.notiUpdate = function (date_added, content, callback) {
    pool.query('UPDATE notification SET content = $2 WHERE date_added = $1;', [date_added, content], function (err, result) {
        if (err) {
            console.log(err.stack);
        } else if (typeof callback === 'function') {
            callback(result.rowCount);
        }
    });
};
