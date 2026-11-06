# Prepare releases locally

This is contributor documentation, separate from installation. Nothing in these commands publishes packages, creates Git tags, pushes commits, or deploys the docs.

```sh
npm run release:build
npm run release:check
```

`release.json`, the client package version, and the WordPress header must agree. Output is under `releases/<version>/`: npm tarball, compiled client ZIP, unconfigured PHP runtime/Composer ZIP, WordPress ZIP, `manifest.json`, and `SHA256SUMS`. The builder copies these into the ignored `docs/public/releases` tree for local previews. It reads only allowlisted runtime trees; site YAML, `.env`, compiled site-specific PHP archives, credentials, tests, Git metadata and operator notes are not release inputs.

## npm readiness

`npm pack` runs the prepack TypeScript build. The CLI bin is `dist/index.js`, with a Node shebang. Runtime dependencies are bundled: relying on the root-only `overrides` field alone would not preserve the tested FTP dependency substitutions when installed by another project. Source watchers and test frameworks are not required to execute the packed CLI. The release checker installs the tarball offline into a clean project and exercises it there.

## Packagist readiness

The repository-root `composer.json` describes `jalsoedesign/phile-transfer-protocol-server` as a library with PSR-4 autoloading. The separate `ptp-server/composer.json` remains the PHP contributor/test harness. The prepared server ZIP carries explicit version metadata for Composer artifact-repository tests. A future VCS/Packagist release derives its version from Git tags; the root manifest deliberately has no hardcoded version.

Composer clients use `Server::run($privateConfigurationPath)` from an application-owned public bootstrap. Dependencies can be updated without replacing that configuration or bootstrap. The normal PHP ZIP contains the same runtime and a direct autoloader entry point.

## Public release contract

The planned origin is `https://phile-transfer-protocol.jalsoedesign.net`. `/releases/latest.json` describes the selected release and links versioned artifacts. `published: false` marks local preparation and drives the documentation notice. The separate `ptp-client-ui` app consumes this manifest for verified downloads. No update installer or live release service is published here.

Before an eventual publication, confirm licensing and package ownership, run checks on a clean host, review archive contents, then separately authorize registry publishing and hosting deployment. Those actions are outside this preparation task.
