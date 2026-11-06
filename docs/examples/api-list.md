# List remote files with Node.js

This complete, read-only example uses Node.js built-in `fetch`. No PTP JavaScript SDK or runtime dependency is imported. Set up the [standalone endpoint](../guide/quick-start) or [WordPress plugin](../guide/wordpress) first.

## Download and configure

Download <DownloadLink path="/examples/api-list/list.ts">list.ts</DownloadLink>, <DownloadLink path="/examples/api-list/list.js">list.js</DownloadLink>, <DownloadLink path="/examples/api-list/list.mjs">list.mjs</DownloadLink>, <DownloadLink path="/examples/api-list/list.cjs">list.cjs</DownloadLink>, and <DownloadLink path="/examples/api-list/package.json">package.json</DownloadLink> into one directory. Node.js 22.13+ is required. `package.json` marks `.js` as ESM; `.mjs` is explicitly ESM and `.cjs` explicitly CommonJS. The TypeScript file uses erasable interfaces and Node's `--experimental-strip-types`; depending on the Node release, it may print an experimental warning to stderr. For static checking, install the manifest's development dependencies and run the local TypeScript compiler. There are no runtime packages to install.

Set environment values in the terminal that will run the example:

::: code-group
```powershell [PowerShell]
$env:PTP_ENDPOINT = 'https://example.com/ptp-server.php'
$env:PTP_USERNAME = 'operator'
$env:PTP_PASSWORD = 'your-private-password'
$env:PTP_PATH = '/'
```
```sh [POSIX shell]
export PTP_ENDPOINT='https://example.com/ptp-server.php'
export PTP_USERNAME='operator'
export PTP_PASSWORD='your-private-password'
export PTP_PATH='/'
```
:::

For WordPress use the exact downloaded endpoint and your Application Password. `PTP_PATH` is the logical remote path below the selected endpoint root. It is unrelated to the host directory containing the example files.

## Complete source

<LanguageTabs label="Listing source language">
<template #typescript>

<<< @/examples/api-list/list.ts

</template>

<template #javascript>

<<< @/examples/api-list/list.js

</template>

<template #mjs>

<<< @/examples/api-list/list.mjs

</template>

<template #commonjs>

<<< @/examples/api-list/list.cjs

</template>
</LanguageTabs>

## Run it

Run in the directory containing the downloaded example files. Both tab groups stay synchronized, including after SPA navigation; a full reload defaults to TypeScript.

<LanguageTabs label="Listing run command language">
<template #typescript>

```sh
node --experimental-strip-types list.ts
```

</template>

<template #javascript>

```sh
node list.js
```

</template>

<template #mjs>

```sh
node list.mjs
```

</template>

<template #commonjs>

```sh
node list.cjs
```

</template>
</LanguageTabs>

## Captured local results

The checks execute every variant against a disposable PHP endpoint serving a four-byte `notes.txt`. The compact summary below is produced by the example, not the raw HTTP response:

<<< @/examples/api-list/output.txt

An empty directory produces:

<<< @/examples/api-list/empty.txt

An incorrect password exits 1 and writes `PTP request failed (HTTP 401)` to stderr. A missing environment value exits 1 with the setup message. Successful runs exit 0 and write their summary JSON to stdout. The script does not log the password, Authorization header, or remote error body.
