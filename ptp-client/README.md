# PTP client

Version 0.3.0 defaults to authenticated encrypted JSON POST requests, keeping file paths and upload contents out of plaintext request inspection. Update the WordPress plugin or standalone endpoint first. Existing credentials and YAML work without an extra key. Use `requestTransport: legacy` only when explicitly connecting to an older endpoint. [Upgrade guide](https://h2ooooooo.github.io/phile-transfer-protocol/advanced/encrypted-requests.html).

The PTP client is a local FTP bridge for standalone PHP and WordPress endpoints. It installs the `ptp` CLI executable; it does not expose a supported JavaScript SDK. Node.js 22.13+ is required on the client host. Remote endpoints use HTTPS; local loopback HTTP is supported for testing.

## npm installation

After publication:

```sh
npm install --global @jalsoedesign/phile-transfer-protocol-client
ptp --help
ptp ./site.yaml
```

Before publication, install the prepared `.tgz` by filename instead. The complete [installation guide](https://h2ooooooo.github.io/phile-transfer-protocol/guide/client-install.html) also covers compiled ZIPs. The ZIP bundles runtime dependencies: extract and run `npm start -- /absolute/path/to/site.yaml`, with no build required.

## Configuration

```yaml
host: 127.0.0.1
port: 8021
passiveUrl: 127.0.0.1
apiEndPoint: 'https://example.com/ptp-server.php'
apiUsername: 'operator'
apiPassword: 'REPLACE_WITH_A_PRIVATE_PASSWORD'
printCommands: false
```

WordPress users download this profile from Tools > PTP and supply their Application Password. Start the bridge, then connect an FTP editor to 127.0.0.1:8021 using the same username/password, plain FTP and passive mode. The selected files remain on the remote host.

`--help` and `--version` exit without starting the bridge. A profile starts the foreground process; Ctrl+C stops it. Operational logs use JSON severity streams and working-directory log files. Credentials and raw FTP command traces are excluded. The client requires the matching upload-session API and stages verified uploads before replacing destination files.

## Source development

Run inside the source `ptp-client` directory:

```sh
npm ci
npm run build
npm start -- config/site.yaml
```

`npm run dev -- config/site.yaml` uses the TypeScript watcher with local declaration loading enabled. `dist/index.js` is the compiled CLI entry. Run `npm run test:unit` for unit tests, `npm run test:startup` for real startup checks, or `npm test` for the disposable integration suite. The monorepo supplies the test scripts. Normal installed-package users do not need the source tree or TypeScript tools.
