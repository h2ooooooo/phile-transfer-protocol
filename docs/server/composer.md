# Install with Composer

Use this route when the remote PHP application is managed with Composer. PTP is a dependency, so Composer can pin and update its code without replacing site configuration.

## Install the package

Download the [server ZIP](../downloads) into a `packages/` directory in your application project, keeping the ZIP intact. Composer needs the PHP zip extension to read artifact archives. From the application project root, register that directory and install PTP:

```sh
composer config repositories.ptp artifact ./packages
composer require jalsoedesign/phile-transfer-protocol-server:^0.3
```

Keep `composer.lock` with the application deployment configuration. `^0.3` allows compatible `0.3.x` versions; it does not select `0.4`. Keep the ZIP in the artifact directory so the locked dependency can be installed again.

## Configure the endpoint

Create `ptp.env` in the application root, outside the public document root:

```dotenv
PTP_USERNAME=operator
PTP_PASSWORD='REPLACE_WITH_A_LONG_PRIVATE_PASSWORD'
PTP_ROOT_PATH=/srv/site-files
```

Create `public/ptp-server.php` with this complete source:

```php
<?php

use jalsoedesign\PhileTransferProtocol\Server;

require dirname(__DIR__) . '/vendor/autoload.php';

Server::run(dirname(__DIR__) . '/ptp.env');
```

`Server::run()` serves the current HTTP request and terminates it after output. The optional argument selects a private environment file. It does not run an FTP daemon or install a service. Existing direct `src/ptp-server.php` deployments continue to work.

## Upload to PHP hosting

Install production dependencies in the deployment copy with `composer install --no-dev --prefer-dist`. Upload that application's `vendor` directory and `public/ptp-server.php` through the normal deployment process. Put `ptp.env` at the private absolute location used by the entry point. If `public` is copied into `public_html` separately, adjust the autoloader and configuration paths to the actual remote layout.

Serve the entry point over HTTPS, check `?action=hello` returns `hi`, then follow [client setup](../guide/quick-start#4-start-the-client). PHP 8.2+, JSON, OpenSSL for encrypted requests, and filesystem permissions are still required on the remote host. Node.js is only needed on the client host.

## Updates

Download the selected server ZIP into `packages/`, then run:

```sh
composer update jalsoedesign/phile-transfer-protocol-server --with-dependencies
```

Review and test the changed lock file before deploying it. Updating dependencies in a deployment copy does not upload that copy to the remote host. Keep `ptp.env` and the public entry point outside the managed package. [Full update and rollback workflow](../guide/updates).
