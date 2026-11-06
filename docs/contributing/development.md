# Develop from source

Installed npm/ZIP users should follow [client installation](../guide/client-install). This page is for changing PTP itself.

## Install dependencies

From the repository root:

```sh
npm ci
npm --prefix ptp-client ci
composer --working-dir=ptp-server install
```

Node.js 22.13+ runs the bridge and tools. PHP 8.2+ with JSON runs the endpoint and tests; ZIP support builds archives. Composer installs PHP test tools. Box is optional and only needed for the compiled single-file endpoint.
The root npm commands select a compatible PHP runtime automatically, including common versioned commands such as php82. Set PTP_PHP_BINARY to an absolute PHP executable path when you need to select one explicitly. An explicit incompatible override fails with a descriptive error. Composer itself must also run under PHP 8.2 or newer.

The PHP contributor lockfile resolves dependencies against PHP 8.2.0, even when updates run on a newer development runtime. PHPUnit 11 is the newest major compatible with that minimum; PHPUnit 12 requires PHP 8.3 and PHPUnit 13 requires PHP 8.4. The production library contains no third-party PHP runtime dependencies.

## Run the client {#run-the-client}

```sh
cd ptp-client
npm run dev -- config/site.yaml
```

The watcher includes `--files` so local FTP declarations load. Existing FTP sessions disconnect on reload. For compiled use, run `npm run build`, then `npm start -- config/site.yaml`. `dist/index.js` is the stable CLI entry; `dist/src/index.js` remains available for older source workflows. Do not copy old build output into a new checkout.

## Run the source PHP endpoint

From `ptp-server`, `composer generate-playground-files` creates local fixtures and `composer dev` serves the source at `http://127.0.0.1:8000/ptp-server.php`. The command explicitly supplies `test` credentials and a local playground root. Keep it bound to loopback.

The runtime `.env` default for direct source deployment is `ptp-server/.env`. The supported [Composer entry point](../server/composer) selects a deployment-owned configuration file explicitly.

## Tests and builds

```sh
npm test
npm --prefix ptp-client run test:unit
npm --prefix ptp-client run test:startup
npm run test:wordpress
npm run release:build
npm run release:check
npm run docs:check
```

The shared runner provisions synthetic PHP/FTP servers, checks the HTTP contract, builds TypeScript and exercises startup commands. No live site credentials are used. `test:wordpress` uses test doubles. `test:wordpress:http` is an optional Docker-backed real WordPress check; it requires Docker and its disposable WordPress containers. [Docker instructions](../advanced/docker).

## Package interface {#npm-documentation-assumption}

The client manifest now declares the `ptp` bin, Node requirement, semantic version, explicit files, and a prepack build. Its production dependency closure is bundled to preserve tested dependency versions in downstream installs. PTP provides an HTTP API and CLI, not an exported JavaScript toolkit. Release preparation does not register the package on npm or Packagist.

## Dependency compatibility

Use the latest stable releases that support the declared runtime and companion tools. PTP keeps PHP 8.2 as its minimum and Node.js 22.13 as its minimum client runtime. Node type definitions remain on the 22.x line.

The client and desktop use TypeScript 6.0.3 because the current ts-jest and Volar releases require TypeScript below 7. Jest 30 uses patched glob and minimatch overrides, with regression coverage for cancellation, coverage-file selection, and merges. The desktop uses Vite 8; stable VitePress 1.6.4 remains on Vite 7 because its bundle-generation plugin is not compatible with Rolldown.

PHPUnit 11 is the newest major supporting PHP 8.2. Composer resolves development dependencies against PHP 8.2.0 so installing on a newer development runtime does not silently raise the remote runtime requirement. PHP 8.2 security support ends on December 31, 2026; newer hosting runtimes are supported.

PTP uses the maintained @electerm/ftp-srv engine and routes its logs through Winston. PTP adapters preserve atomic upload completion, cancellation, restart behavior, and directory metadata. The engine boundary also handles its CommonJS export shape, IPv6 binding, and bounded command framing. Keep the FTP socket regressions when upgrading the engine, because these contracts differ from the former implementation. The former ftp-srv, Bunyan, and their legacy security overrides have been removed. The archived ts-node-dev watcher has been replaced by tsx; ts-node and tree-kill are no longer direct development dependencies.
