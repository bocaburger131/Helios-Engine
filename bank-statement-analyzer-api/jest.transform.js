export default {
    process(src, filename) {
        return {
            code: src
                .replace(/require\(/g, 'import(')
                .replace(/module\.exports/g, 'export default'),
        };
    },
};