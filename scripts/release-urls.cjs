function resolveReleaseBaseUrl(configuredUrl, docsUrl) {
    const invalidUrlMessage = 'The documentation URL must use HTTPS and contain no credentials, query, or fragment.';
    let url;

    try {
        url = new URL(docsUrl || configuredUrl);
    } catch {
        throw new Error(invalidUrlMessage);
    }

    if (url.protocol !== 'https:' || url.username || url.password || url.href.includes('?') || url.href.includes('#')) {
        throw new Error(invalidUrlMessage);
    }

    return url.href.replace(/\/+$/, '');
}

module.exports = {resolveReleaseBaseUrl};
