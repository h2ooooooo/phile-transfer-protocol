# Server deployment

The [quick start](../guide/quick-start) uploads an unconfigured runtime ZIP and selects a private environment file. [Composer](../server/composer) manages the same implementation as a dependency. Both keep site settings outside managed runtime files. This page covers advanced layouts and the optional compiler.

## Compiled single-file endpoint {#compiled-single-file-endpoint}

Build from `ptp-server` with PHP, Composer, and Box installed:

```sh
composer install
composer compile -- --root-path='/srv/site/theme' --username='operator'
```

Upload `dist/ptp-server.php` to a location where PHP files execute. The target host needs PHP 8.2+, JSON, and Phar support. It does not need Node.js, Composer, or Box.

That is the entire standalone upload: **one PHP archive containing the API and compiled configuration**. Keep `tmp/.ptp-credentials.json` on the client host. A separate environment file is optional, not required for this deployment.

Prefer an endpoint location outside the selected file root. For example, keep the endpoint in the site's public directory and serve only a child-theme subdirectory.

The compiler builds a fresh candidate, checks that it exists and passes PHP syntax validation, and replaces the local output only after success. A failed build leaves the previous artifact in place. This is build protection, not a deployment rollback mechanism.

## Source deployment

Deploy the contents of `ptp-server/src` together, preserving directory structure. The entrypoint is `ptp-server.php`; its sibling autoloader and classes are required. The runtime has no Composer package dependencies.

Set process environment variables or use a private environment file:

```dotenv
PTP_USERNAME=operator
PTP_PASSWORD='your-secret'
PTP_ROOT_PATH=/srv/site/theme
```

For source deployments, `.env` is read from the parent of the `src` directory by default. If you arrange files differently, set `PTP_ENV_FILE` to an absolute private filename. Keep credentials outside the web document root. An empty `PTP_ENV_FILE` disables environment-file loading.

## Changing credentials without compiling again

Runtime settings override compiled defaults. Set `PTP_USERNAME` and `PTP_PASSWORD` in the host environment or selected private environment file, then update the local YAML.

If you replace the artifact instead, generate a new credential by leaving all password sources unset or using `--password='%GENERATE_PASSWORD%'`. A password supplied through the CLI, build configuration, or environment is reused. Replace the deployed file and update your local YAML; compiling alone does not rotate the running endpoint. See [credential storage and rotation](./security#standalone-credentials). Do not leave an older reachable endpoint with old credentials behind.

## Reverse proxies and host setup

Use HTTPS for remote requests and make sure Authorization reaches PHP. Point the client at the final URL; the bridge will not follow redirects.

Allow the API's GET, POST, and DELETE requests through the proxy. Write requests carry raw bytes with `application/octet-stream`. Check request-body limits and timeouts when large transfers fail.

Deploy the standalone endpoint independently of WordPress if you want it to remain available when a theme breaks. Rewriting all requests through WordPress can defeat that separation.

## Verify the deployment

1. Check `?action=hello` returns `hi`.
2. Connect with the bridge and list `/` to verify authentication and root selection.
3. Upload and download a disposable file to verify write access and byte preservation.
4. Delete the test file.

If the endpoint is downloaded as source instead of executed, remove it and fix PHP handling before proceeding.

## Logs and cleanup

Optional server logging must use a path outside both the API root and web document root. Sensitive headers are redacted, and body logging records sizes only. See [server configuration](../reference/server#logging).

For one-off maintenance, remove or restrict the endpoint when finished. Keep backups and recovery access separate from PTP.
