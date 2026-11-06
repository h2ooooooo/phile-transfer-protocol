# PTP

[![Documentation](https://github.com/h2ooooooo/phile-transfer-protocol/actions/workflows/docs.yml/badge.svg)](https://github.com/h2ooooooo/phile-transfer-protocol/actions/workflows/docs.yml)

[Documentation](https://h2ooooooo.github.io/phile-transfer-protocol/) · [Downloads](https://h2ooooooo.github.io/phile-transfer-protocol/downloads.html) · [Acceptable-use terms](docs/acceptable-use.md) · [Source on GitHub](https://github.com/h2ooooooo/phile-transfer-protocol)

> [!IMPORTANT]
> Use PTP only for authorized maintenance. Read the [acceptable-use terms](docs/acceptable-use.md) before installing an endpoint. The same page is available in the [hosted documentation](https://h2ooooooo.github.io/phile-transfer-protocol/acceptable-use.html).

PTP connects an FTP editor on the client host to a remote PHP filesystem over HTTPS. Use the WordPress plugin for selectable plugin/theme/upload access, or deploy the standalone PHP endpoint to other PHP hosting. No remote FTP daemon is required.

PTP is pronounced “Phile Transfer Protocol”, with “Phile” combining PHP and file.

PTP uses encrypted JSON POST requests by default to keep filenames and operations out of request URLs and plaintext request inspection. Update the remote endpoint before the client; existing credentials and YAML remain usable. [Encrypted requests and upgrade steps](https://h2ooooooo.github.io/phile-transfer-protocol/advanced/encrypted-requests.html).

## Choose a workflow

| Component | Distribution | Start here |
| --- | --- | --- |
| Local FTP bridge | npm CLI or compiled client ZIP | [Client installation](https://h2ooooooo.github.io/phile-transfer-protocol/guide/client-install.html) |
| Desktop connection manager | Separate Electron app, run with npm | [Desktop setup](https://h2ooooooo.github.io/phile-transfer-protocol/guide/desktop.html) |
| Standalone PHP endpoint | Composer / Packagist or runtime ZIP | [Upload PHP](https://h2ooooooo.github.io/phile-transfer-protocol/guide/quick-start.html), [Composer](https://h2ooooooo.github.io/phile-transfer-protocol/server/composer.html) |
| WordPress endpoint | Installable plugin ZIP | [WordPress quick start](https://h2ooooooo.github.io/phile-transfer-protocol/guide/wordpress.html) |
| Integrations | HTTP API | [API documentation](https://h2ooooooo.github.io/phile-transfer-protocol/api/) |

GitHub Pages hosts the documentation and downloadable archives at [h2ooooooo.github.io/phile-transfer-protocol](https://h2ooooooo.github.io/phile-transfer-protocol/). Documentation source is also browsable under [docs/](docs/index.md).

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

## Documentation and builds

The [Documentation workflow](.github/workflows/docs.yml) builds and checks the site on pushes to `main`, then deploys it to GitHub Pages. Enable **Settings > Pages > Build and deployment > Source: GitHub Actions** once. [Full Pages setup](docs/contributing/docs.md#github-pages).

```sh
npm run release:build
npm run release:check
npm run test:docs
npm run docs:build
npm run docs:check
npm run docs:dev
```

Artifacts are generated under `releases/0.3.0` and mirrored into the local docs downloads. The separate `ptp-client-ui` Electron app uses the manifest for verified server/plugin downloads and runs the existing client underneath. It supports multiple concurrent bridges, encrypted profiles, YAML import, and live logs. No installer or automatic updater is implemented. VitePress dev/production preview retain their existing ports, 5173/4173.

`npm test` runs disposable integration tests; `npm run test:wordpress` checks the plugin adapter. The optional Docker-backed WordPress HTTP tests are documented in [development](docs/contributing/development.md). Local build commands prepare files; the GitHub Pages workflow publishes the built site.

Use PTP only for authorized maintenance. Keep credentials private, select a narrow remote root, and retain recovery access when editing executable PHP. [Acceptable-use terms](docs/acceptable-use.md). License: [MIT](LICENSE).
