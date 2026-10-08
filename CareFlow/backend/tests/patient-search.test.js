const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeSearch, searchPattern } = require('../models/patient-search');

const queries = [];
const dbPath = require.resolve('../data/db');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    async query(sql, params) {
        queries.push({ sql, params });
        return [[{ id: 1, inQueue: 1 }]];
    },
} };
const Patients = require('../models/patients');

test('Arabic searches normalize marks, alef, ya, and Arabic digits', () => {
    assert.equal(normalizeSearch('  أَحْمَـد إآ على ٠١٢٣٤٥٦٧٨٩  '), 'احمد اا علي 0123456789');
    assert.equal(normalizeSearch('ＡＢＣ'), 'abc');
});

test('LIKE metacharacters are searched literally', () => {
    assert.equal(searchPattern('100%_!'), '%100!%!_!!%');
});

test('empty searches do not read patient records', async () => {
    queries.length = 0;
    for (const query of [undefined, '', '   ', 'َـ']) {
        assert.deepEqual(await Patients.searchPatients(10, query), [[]]);
    }
    assert.equal(queries.length, 0);
});

test('all query terms and clinic ownership are bound, including hostile input', async () => {
    queries.length = 0;
    const result = await Patients.searchPatients(10, "أَحمد ١٢ %_! 'OR");
    assert.deepEqual(result, [[{ id: 1, inQueue: 1 }]]);
    const { sql, params } = queries[0];
    assert.deepEqual(params, [10, '%احمد%', '%12%', '%!%!_!!%', "%'or%"]);
    assert.match(sql, /WHERE clinic_id = \?/);
    assert.equal((sql.match(/LIKE \? ESCAPE '!'/g) || []).length, 4);
    assert.ok(!sql.includes("'or"));
    assert.match(sql, /EXISTS \(SELECT 1 FROM in_queue/);
});
