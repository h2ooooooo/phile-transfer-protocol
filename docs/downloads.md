# Downloads and releases

PTP 0.3.0 has three independently installable components. Choose one remote endpoint, then run the client on the host where the FTP editor runs.

<ReleaseDownloads />

- **Client ZIP:** compiled JavaScript and bundled runtime dependencies. Requires Node.js 22.13+; no TypeScript build or dependency installation is needed to run the extracted release.
- **Server ZIP:** unconfigured PHP runtime, public entry point, private configuration template, and Composer package metadata. Requires PHP 8.2+ with JSON and OpenSSL for encrypted requests; no Composer installation is needed for ZIP deployment.
- **WordPress ZIP:** install directly through Plugins > Add New > Upload Plugin. Requires WordPress 5.6+, PHP 8.2+ with OpenSSL for encrypted requests, HTTPS, and an administrator allowed to edit files.

## Install instructions

[WordPress](./guide/wordpress) · [Standalone PHP upload](./guide/quick-start) · [Composer installation](./server/composer) · [Client installation](./guide/client-install)

## Versions and checksums

The release manifest is available at [releases/latest.json](/releases/latest.json). It contains version, runtime requirements, publication status, artifact sizes, planned public URLs, and SHA-256 checksums. Versioned files are under `/releases/0.3.0/`; <DownloadLink path="/releases/0.3.0/SHA256SUMS">SHA256SUMS</DownloadLink> lists the checksums. A prepared <DownloadLink path="/releases/0.3.0/ptp-client-0.3.0.tgz">npm tarball</DownloadLink> is available for local installation before registry publication.

The planned public origin is `https://phile-transfer-protocol.jalsoedesign.net`. Local previews serve the same download paths locally. Nothing in this preparation publishes that origin or registers npm/Packagist packages.

Keep the client and endpoint on the same release initially; the client requires the verified upload-session API. Read [updates](./guide/updates) before replacing deployed files.
