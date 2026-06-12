module.exports = (path, options) => {
    // Handle module name collisions
    if (path === 'bank-statement-analyzer-api') {
        return options.defaultResolver('./package.json', options);
    }
    return options.defaultResolver(path, options);
};