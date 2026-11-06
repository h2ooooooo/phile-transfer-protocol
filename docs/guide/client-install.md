# Install and run the client

The client is a **CLI application** that installs the `ptp` executable. Its public automation interface is the [HTTP API](../api/); there is no supported JavaScript SDK import in this release.

Prefer a desktop interface? The separate [Electron connection manager](./desktop) runs this client underneath and supports multiple concurrent bridges, saved profiles, live logs, and endpoint downloads.

Install Node.js 22.13+ on the client host. The [Node.js installer](https://nodejs.org/en/download) includes npm. The remote PHP host does not need Node.js.

## Option 1: npm package

After publication, install the executable:

```sh
npm install --global @jalsoedesign/phile-transfer-protocol-client
ptp --version
ptp --help
```

Expected version output for this prepared release:

```text
0.3.0
```

Before publication, download the [prepared tarball](../downloads) and install the downloaded file with `npm install --global ./ptp-client-0.3.0.tgz`. That tests the same package without contacting the registry for PTP.

Create a private `site.yaml` using the WordPress download or [complete configuration](../reference/client#complete-example). Then run:

```sh
ptp ./site.yaml
```

## Option 2: downloaded client ZIP

Download the [client ZIP](../downloads), extract it, and open a terminal **inside the extracted directory containing `package.json`**. Run:

```sh
npm start -- /absolute/path/to/site.yaml
```

On Windows, an example is `npm start -- "C:/Users/operator/Documents/PTP/site.yaml"`. Alternatively run `node dist/index.js /absolute/path/to/site.yaml`. The ZIP already contains compiled files and runtime dependencies. Do not run `npm ci` in the release ZIP; use that command when working from the source checkout.

## Expected startup

The terminal includes a JSON log whose `message` is:

```text
FTP Server started at ftp://127.0.0.1:8021
```

Keep that process running while the FTP editor is connected. Press Ctrl+C to stop it. Start the client again for the next work session; it is not installed as a background service.

## Working from source

Source users install development dependencies and build once for compiled use:

```sh
cd ptp-client
npm ci
npm run build
npm start -- config/site.yaml
```

For editing TypeScript, use `npm run dev -- config/site.yaml` instead. It reloads after source changes and disconnects existing FTP sessions when restarting. [Contributor setup](../contributing/development#run-the-client) explains the complete source workflow.
