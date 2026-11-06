# Standalone PHP quick start

Use this route for PHP hosting without WordPress, or when you want an independent endpoint. The server exposes selected remote files over HTTPS; the client exposes them as local FTP on the client host.

**You need:** permission to install and edit files, PHP 8.2+ with JSON and OpenSSL on the remote host, HTTPS, and Node.js 22.13+ on the client host. For a useful first test, create a remote directory with a disposable `notes.txt` file.

## 1. Download and extract the server

Get the [server ZIP](../downloads). It contains:

```text
ptp/
  ptp.env.example
  public/ptp-server.php
  ptp-server/src/
  examples/existing-site/ptp-server.php
  examples/composer/ptp-server.php
```

The ZIP has no configured password or root. You edit a private configuration file, not the managed PHP implementation.

## 2. Configure the remote root and credentials

Copy `ptp.env.example` to `ptp.env`. Set:

```dotenv
PTP_USERNAME=operator
PTP_PASSWORD='REPLACE_WITH_A_LONG_PRIVATE_PASSWORD'
PTP_ROOT_PATH=/home/customer/site-files
```

`PTP_ROOT_PATH` is an **existing absolute filesystem directory on the remote PHP host**, not a URL or a directory on the client host. Give the PHP process read/write access only as needed. Use the same username and password in the client YAML later.

## 3. Upload it to an existing website

Using the hosting file manager or another existing deployment route:

1. Upload the extracted runtime directory to `/home/customer/ptp`, outside the website document root.
2. Keep `/home/customer/ptp/ptp.env` private.
3. Upload `examples/existing-site/ptp-server.php` to `/home/customer/public_html/ptp-server.php`.

For this example layout the complete public entry point is:

```php
<?php

use jalsoedesign\PhileTransferProtocol\Server;

require dirname(__DIR__) . '/ptp/ptp-server/src/autoload.php';

Server::run(dirname(__DIR__) . '/ptp/ptp.env');
```

If the hosting layout differs, adjust those **two filesystem paths**. Do not put the private configuration inside `public_html`. You may instead keep the archive layout intact and configure the website document root to its `public` directory; its included `public/ptp-server.php` already uses the matching paths.

| Role | Example |
| --- | --- |
| Runtime files on remote host | `/home/customer/ptp/ptp-server/src/` |
| Private remote configuration | `/home/customer/ptp/ptp.env` |
| Public remote PHP entry point | `/home/customer/public_html/ptp-server.php` |
| Endpoint URL | `https://example.com/ptp-server.php` |
| Files exposed through FTP | `/home/customer/site-files` |

Visit `https://example.com/ptp-server.php?action=hello`. The response is `hi`. This checks startup, not credentials or write access. Missing configuration returns HTTP 503 instead of using a shared password.

## 4. Start the client {#4-start-the-client}

Install the [client](./client-install). Save this private YAML on the client host as `site.yaml`:

```yaml
host: 127.0.0.1
port: 8021
passiveUrl: 127.0.0.1
apiEndPoint: 'https://example.com/ptp-server.php'
apiUsername: 'operator'
apiPassword: 'REPLACE_WITH_A_LONG_PRIVATE_PASSWORD'
printCommands: false
```

```sh
ptp ./site.yaml
```

For the downloaded client folder, run `npm start -- /absolute/path/to/site.yaml` from that folder instead. Wait for `FTP Server started at ftp://127.0.0.1:8021`.

## 5. Transfer a useful test file

[Connect an FTP editor](./editors) to `127.0.0.1:8021`, plain FTP, passive mode, using `operator` and the same private password. Download remote `/notes.txt` to the client host, edit it, then upload it back to remote `/notes.txt`.

Both FTP paths are relative to `PTP_ROOT_PATH`. A successful upload changes `/home/customer/site-files/notes.txt` on the remote host. It does not change the public endpoint or copy the file into the local app directory.

## Other installation methods

- [Composer / Packagist installation](../server/composer) keeps PHP implementation files under `vendor` and configuration outside them.
- [Compiled single-file deployment](../advanced/deployment#compiled-single-file-endpoint) is for installations that need one PHP archive. It requires local build tools and embeds deployment settings.
- [Updates](./updates) explains replacement, rollback, and retained configuration.
