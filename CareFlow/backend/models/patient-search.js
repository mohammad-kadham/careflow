function normalizeSearch(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase()
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
        .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي')
        .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).trim();
}

// SQL contains only fixed fields and rules. Search terms use bound parameters.
let searchExpression = "REGEXP_REPLACE(LOWER(CONVERT(CONCAT_WS(' ', name, CAST(id AS CHAR), phone, city) USING utf8mb4)) COLLATE utf8mb4_bin, '[ً-ٰٟـ]', '')";
for (const [from, to] of [
    ['أ', 'ا'], ['إ', 'ا'], ['آ', 'ا'], ['ى', 'ي'],
    ...Array.from('٠١٢٣٤٥٦٧٨٩', (digit, index) => [digit, String(index)]),
]) {
    searchExpression = "REPLACE(" + searchExpression + ", '" + from + "', '" + to + "')";
}

function searchPattern(term) {
    return '%' + term.replace(/[!%_]/g, '!$&') + '%';
}

module.exports = { normalizeSearch, searchExpression, searchPattern };
