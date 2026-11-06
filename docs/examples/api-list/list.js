async function main() {
    const endpoint = process.env.PTP_ENDPOINT;
    const username = process.env.PTP_USERNAME;
    const password = process.env.PTP_PASSWORD;
    const remotePath = process.env.PTP_PATH || '/';

    if (!endpoint || !username || !password) {
        throw new Error('Set PTP_ENDPOINT, PTP_USERNAME and PTP_PASSWORD.');
    }

    const url = new URL(endpoint);
    url.searchParams.set('action', 'list');
    url.searchParams.set('path', remotePath);

    const response = await fetch(url, {
        headers: {
            Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64'),
        },
    });

    if (!response.ok) {
        throw new Error('PTP request failed (HTTP ' + response.status + ')');
    }

    const result = await response.json();

    if (result.success !== true || !Array.isArray(result.list)) {
        throw new Error('The endpoint did not return a PTP listing.');
    }

    const entries = result.list.map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory,
        size: entry.size,
    }));

    console.log(JSON.stringify({path: remotePath, entries}, null, 2));
}

main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
