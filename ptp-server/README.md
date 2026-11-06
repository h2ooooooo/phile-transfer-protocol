# PTP PHP server

PTP exposes authenticated file operations through a PHP HTTP endpoint. PHP 8.2+, JSON, and OpenSSL are required for the current encrypted transport; use HTTPS for remote access. No Node.js or remote FTP service is required on the PHP host.

Version 0.3.0 accepts encrypted JSON POST requests and retains the legacy API. Update the remote runtime before the client. Keep the existing private configuration, credentials, and public bootstrap. No additional encryption key is needed. [Upgrade and transport guide](https://h2ooooooo.github.io/phile-transfer-protocol/advanced/encrypted-requests.html).

## Install with Composer

Download the [server ZIP](https://h2ooooooo.github.io/phile-transfer-protocol/downloads.html) into your application project's `packages/` directory without extracting it. Register the artifact directory and install PTP:

```sh
composer config repositories.ptp artifact ./packages
composer require jalsoedesign/phile-transfer-protocol-server:^0.3
```

Create an application-owned public PHP entry point that loads `vendor/autoload.php` and calls `jalsoedesign\PhileTransferProtocol\Server::run($privateEnvironmentFile)`. Keep that configuration outside the public document root and outside `vendor`, so package updates cannot replace it. The server ZIP includes a complete `examples/composer/ptp-server.php` bootstrap. [Composer deployment guide](https://h2ooooooo.github.io/phile-transfer-protocol/server/composer.html).

## Upload the runtime ZIP

The ZIP includes an unconfigured PHP runtime, `public/ptp-server.php`, `ptp.env.example`, and alternate hosting-layout examples. Copy the template to private `ptp.env`, set `PTP_USERNAME`, `PTP_PASSWORD`, and an existing absolute remote `PTP_ROOT_PATH`, then upload the runtime outside the web document root. Put only the entry point in the public website directory and adjust its autoloader/configuration paths for that layout. [Step-by-step upload guide](https://h2ooooooo.github.io/phile-transfer-protocol/guide/quick-start.html).

Configuration has no shared default credentials. Missing values fail with HTTP 503. Environment values override the selected file; an explicit `Server::run()` file argument chooses that file ahead of the `PTP_ENV_FILE` selector. Direct source deployments retain the `.env` default above `src`; compiled archives retain their legacy runtime overrides.

## API and updates

Actions include listing and paginated listing, stat, binary reads, raw direct writes, directory creation/removal, rename, chmod, and verified upload sessions. All modifying actions require their specified HTTP method. `hello` returns `hi` after valid startup; the WordPress adapter additionally requires authentication for every action. See [HTTP API reference](https://h2ooooooo.github.io/phile-transfer-protocol/reference/api.html).

Use Composer constraints and a committed application lock file for reproducible updates. ZIP users replace runtime files while preserving private configuration and their public entry point. A compiled single-file deployment still requires rebuilding and uploading the generated archive; do not publish site-specific compiled credentials as generic release artifacts.

## Contributor tools

The nested `ptp-server/composer.json` installs PHP test tools for this monorepo. `composer dev` serves source with explicit local test credentials on loopback. `composer test` runs disposable checks. `composer compile -- --root-path=/absolute/remote/root --username=operator` uses the optional Box tool to create a deployment-specific PHP archive and stores generated credentials privately. Docker Compose remains an optional development/deployment route. See the source repository's contributor documentation.
