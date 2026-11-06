# Build release archives

Build the downloadable client, PHP server, and WordPress archives from the repository root:

```sh
npm run release:build
npm run release:check
```

`release.json`, the client package version, and the WordPress header must agree. Output is under `releases/<version>/`: npm tarball, compiled client ZIP, unconfigured PHP runtime/Composer ZIP, WordPress ZIP, `manifest.json`, and `SHA256SUMS`. The builder copies these into the ignored `docs/public/releases` tree for the documentation site. It reads only allowlisted runtime trees; site YAML, `.env`, compiled site-specific PHP archives, credentials, tests, and Git metadata are excluded.

## Client package

`npm pack` runs the prepack TypeScript build. The CLI bin is `dist/index.js`, with a Node shebang. Runtime dependencies are bundled to preserve the tested dependency versions when installed by another project. Source watchers and test frameworks are not required to execute the packed CLI. The release checker installs the tarball offline into a clean project and exercises it there.

## PHP package

The repository-root `composer.json` describes `jalsoedesign/phile-transfer-protocol-server` as a library with PSR-4 autoloading. The separate `ptp-server/composer.json` contains the PHP contributor/test dependencies. The server ZIP carries explicit version metadata for Composer artifact repositories. VCS installs derive their version from Git tags; the root manifest has no hardcoded version.

Composer clients use `Server::run($privateConfigurationPath)` from an application-owned public bootstrap. Dependencies can be updated without replacing that configuration or bootstrap. The PHP ZIP contains the same runtime and a direct autoloader entry point.

## Download manifest

The documentation/download base is `https://h2ooooooo.github.io/phile-transfer-protocol`. `/releases/latest.json` describes the selected version and links its archives with sizes and SHA-256 checksums. The desktop app uses this manifest to verify downloads.

The [GitHub Pages workflow](./docs#github-pages) sets `DOCS_URL` to the configured site URL, so manifest downloads retain the project subpath or custom-domain origin.
