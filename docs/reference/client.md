# Client configuration

The local bridge reads a YAML file supplied as its first positional argument. It does not load `.env` files.

```sh
ptp ./site.yaml
```

See [installation](../guide/client-install) for npm and prebuilt ZIPs, [CLI reference](../cli/client) for commands/output, and [development](../contributing/development#run-the-client) for source watchers.

## Complete example

```yaml
host: 127.0.0.1
port: 8021
passiveUrl: 127.0.0.1
apiUsername: 'operator'
apiPassword: 'your-secret'
apiEndPoint: 'https://example.com/ptp-server.php'
printCommands: false
```

| Key | Type | Meaning |
| --- | --- | --- |
| `host` | string | Local bind address; must be `127.0.0.1`, `::1`, or `localhost` |
| `port` | number | Local FTP port; use 8021 unless another bridge needs a different one |
| `passiveUrl` | string | Bare passive-mode address, such as `127.0.0.1`; not an `ftp://` URL |
| `apiUsername` | string | Remote HTTP Basic username and local FTP username |
| `apiPassword` | string | Remote HTTP Basic password and local FTP password |
| `apiEndPoint` | string | Full PHP or WordPress endpoint URL; spelling and capitalization matter |
| `requestTransport` | string | `encrypted` (default since 0.3.0) sends encrypted JSON POST requests; `legacy` retains action/path query requests for older endpoints |
| `printCommands` | boolean | Exposes the bridge's small built-in command list; keep false for normal editing |
| `extends` | string | Path to another YAML file whose values are loaded first |

Supply the full example or extend a defaults file. The suggested host/port values are not a substitute for missing required configuration.

## Multiple sites

Keep these files together in a private local directory:

```text
connections/
  defaults.yaml
  client-a.yaml
  client-b.yaml
```

`defaults.yaml`:

```yaml
host: 127.0.0.1
port: 8021
passiveUrl: 127.0.0.1
printCommands: false
```

`client-a.yaml`:

```yaml
extends: defaults.yaml
apiUsername: 'operator'
apiPassword: 'client-a-secret'
apiEndPoint: 'https://client-a.example/ptp-server.php'
```

The `extends` path is resolved relative to the file that declares it. Values in the child file override the base. Avoid inheritance cycles. For simultaneous bridges, override `port` in each site's YAML so the listeners do not collide.

## Endpoint URLs

The bridge preserves existing query parameters and encodes action/path parameters individually. Remote endpoints must use HTTPS; HTTP is accepted only for local development endpoints using localhost or a literal loopback address. Embedded URL credentials are rejected. This supports WordPress's plain-permalink endpoint:

```yaml
apiEndPoint: 'https://example.com/?rest_route=/ptp/v1/files'
```

Use the final URL after redirects. Requests have a 60-second timeout and redirects are disabled; these are implementation settings, not YAML options.

## Credentials and logs

In WordPress mode, [create an Application Password using these steps](../guide/wordpress#create-application-password). In standalone mode, use the configured PTP password. Your FTP editor uses the same credentials in either mode. When the WordPress task is finished, [revoke its dedicated password](../guide/wordpress#revoke-application-password).

The bridge writes operational logs under its working directory's `logs` folder. It avoids logging passwords and raw configuration. Do not enable raw FTP protocol tracing when sharing logs, because FTP commands can contain credentials.
