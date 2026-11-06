# PTP

PTP connects an FTP editor on the client host to a remote PHP filesystem over HTTPS. Use the WordPress plugin for selectable plugin/theme/upload access, or deploy the standalone PHP endpoint to other PHP hosting. No remote FTP daemon is required.

PTP is pronounced “Phile Transfer Protocol”, with “Phile” combining PHP and file.

PTP 0.3.0 uses encrypted JSON POST requests by default to keep filenames and operations out of request URLs and plaintext request inspection. Update the remote endpoint before the client; existing credentials and YAML remain usable. [Encrypted requests and upgrade steps](docs/advanced/encrypted-requests.md).

## Choose a workflow

| Component | Distribution | Start here |
| --- | --- | --- |
| Local FTP bridge | npm CLI or compiled client ZIP | [Client installation](docs/guide/client-install.md) |
| Desktop connection manager | Separate Electron app, run with npm | [Desktop setup](docs/guide/desktop.md) |
| Standalone PHP endpoint | Composer / Packagist or runtime ZIP | [Upload PHP](docs/guide/quick-start.md), [Composer](docs/server/composer.md) |
| WordPress endpoint | Installable plugin ZIP | [WordPress quick start](docs/guide/wordpress.md) |
| Integrations | HTTP API | [API documentation](docs/api/index.md) |

The planned documentation/download origin is `https://phile-transfer-protocol.jalsoedesign.net`. The current release is prepared locally and has not been published to npm, Packagist, or that origin. Registry installation commands in the docs describe the intended published workflow; prepared archives can be tested locally now.

## Source setup

```sh
npm ci
npm --prefix ptp-client ci
composer --working-dir=ptp-server install
```

Create a private client YAML from the endpoint settings, then run the source watcher:

```sh
npm --prefix ptp-client run dev -- config/site.yaml
```

For compiled source use `npm --prefix ptp-client run build`, followed by `npm --prefix ptp-client start -- config/site.yaml`. The client requires Node.js 22.13+. Remote PHP requires 8.2+ with JSON and HTTPS for non-loopback endpoints.

## Local release and docs preparation

```sh
npm run release:build
npm run release:check
npm run docs:build
npm run docs:check
npm run docs:dev
```

Artifacts are generated under `releases/0.3.0` and mirrored into the local docs downloads. The separate `ptp-client-ui` Electron app uses the manifest for verified server/plugin downloads and runs the existing client underneath. It supports multiple concurrent bridges, encrypted profiles, YAML import, and live logs. No installer or automatic updater is implemented. VitePress dev/production preview retain their existing ports, 5173/4173.

`npm test` runs disposable integration tests; `npm run test:wordpress` checks the plugin adapter. The optional Docker-backed WordPress HTTP tests are documented in [development](docs/contributing/development.md). No commands here publish, tag, push, or deploy.

Use PTP only for authorized maintenance. Keep credentials private, select a narrow remote root, and retain recovery access when editing executable PHP. [Acceptable-use terms](docs/acceptable-use.md). License: [MIT](LICENSE).
