# Server configuration

This page covers the standalone PHP endpoint. The [WordPress plugin](../guide/wordpress) uses its own enablement, file/root selections, permissions mode, and WordPress authentication.

## PHP entry point

The Composer package autoloads `jalsoedesign\PhileTransferProtocol\Server`. Call `Server::run(?string $environmentFile = null): void` once from a public PHP entry point. It serves the current request and terminates after sending the response. An explicit private configuration file takes precedence over the `PTP_ENV_FILE` file selector; process environment values still override values within that file. [Complete Composer example](../server/composer).

## Runtime values

| Variable | Required | Meaning |
| --- | --- | --- |
| `PTP_USERNAME` | Yes | Nonempty HTTP Basic username |
| `PTP_PASSWORD` | Yes | Nonempty HTTP Basic password |
| `PTP_ROOT_PATH` | Yes | Existing directory to serve; prefer an absolute path |
| `PTP_ENV_FILE` | No | Absolute environment-file path; empty disables file loading |
| `PTP_LOG_PATH` | No | Log filename outside the API root and document root, with an existing parent |
| `PTP_LOG_OUTPUT_CONSOLE` | No | Console output flag, false by default |
| `PTP_LOG_HEADERS` | No | Header logging flag, false by default; sensitive headers are redacted |
| `PTP_LOG_BODY` | No | Body-size logging flag, false by default; contents are not logged |

The username, password, and root may come from compiled defaults rather than environment variables. If final required values are missing or invalid, startup returns HTTP 503. There are no implicit production credentials.

Use `true`/`false` or `1`/`0` for boolean settings.

## Runtime precedence

For each setting, the first available value wins:

1. Process environment `PTP_*`.
2. Process environment legacy `API_*` alias.
3. Selected environment file `PTP_*`.
4. Selected environment file legacy `API_*` alias.
5. Embedded compiler defaults, where available.

`API_USERNAME`, `API_PASSWORD`, `API_ROOT_PATH`, and the corresponding logging names remain supported. `PTP_ENV_FILE` is the selector for file loading; it is not read from that same file and has no `API_ENV_FILE` selector alias.

An explicitly empty process value is still an override. It does not fall back to the compiled value.

## Environment files

The ZIP and Composer bootstraps explicitly select private `ptp.env`. For legacy direct source deployments, the default file is `.env` in the `ptp-server` directory, above `src`. For a compiled archive it is `.env` beside the archive. Keep configuration outside public directories using the bootstrap argument or `PTP_ENV_FILE`.

```dotenv
PTP_USERNAME=operator
PTP_PASSWORD='your-secret'
PTP_ROOT_PATH=/srv/site/theme
PTP_LOG_HEADERS=false
PTP_LOG_BODY=false
```

The standalone parser accepts `NAME=value`, optional matching single/double quotes, blank lines, and full-line `#` comments. Values are literal: it does not expand variables or strip inline comments. Relative root paths resolve against the source configuration directory or archive directory, not against an arbitrary custom environment-file location.

Docker Compose has its own environment-file parsing. See [Docker](../advanced/docker) when configuring a container.

## Compiler options

Run from `ptp-server` with Box available on `PATH`:

```sh
composer compile -- --root-path='/srv/site/theme' --username='operator'
```

| Option | Meaning |
| --- | --- |
| `--root-path=...` | Root directory on the deployment host |
| `--username=...` | Embedded API username |
| `--password=...` | Embedded password; `%GENERATE_PASSWORD%` forces generation, otherwise generated only when no password source supplies a value |
| `--log-path=...` | Optional embedded log path |
| `--config=...` | Private build configuration file |

Compiler precedence is named CLI arguments, build configuration file, then process `PTP_*` values. Legacy positional root/username/password arguments are still accepted, but named options are easier to read. Build-time `.env` loading is not automatic.

### Private build configuration

The compiler supports a small flat `key: value` format, not the full YAML specification:

```yaml
root-path: '/srv/site/theme'
username: 'operator'
password: 'your-secret'
log-path: '/srv/private/ptp.log'
```

```sh
composer compile -- --config='/absolute/private/build.yaml'
```

The build configuration is not the bridge's YAML: it uses `root-path` and `username`, not `apiEndPoint` and `apiUsername`. Keep it out of source control.

Output is `dist/ptp-server.php`, the only file required for the compiled standalone deployment. Generated credentials are saved locally to `tmp/.ptp-credentials.json`; do not upload that file. The archive embeds the credential as an encoded default, not a hash. This encoding does not encrypt it. See [storage and rotation details](../advanced/security#standalone-credentials).

## Logging

No file log is enabled by default. The selected filename must have an existing parent outside both the served root and web document root. Header logging redacts credentials, body logging records counts only, and endpoint logs omit query strings.

Choose a private path and arrange rotation/retention through your host. Logs should help diagnose failures without becoming a publicly readable site file.
