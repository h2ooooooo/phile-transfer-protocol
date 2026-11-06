# Client commands

## Commands and arguments

```text
ptp <config.yaml>
ptp --help
ptp --version
```

| Argument | Default / behavior |
| --- | --- |
| `<config.yaml>` | Required profile path on the client host. No implicit profile is selected. Relative paths are resolved using the working directory and legacy source config locations. Prefer an explicit path. |
| `--help`, `-h` | Print usage to stdout and exit 0. No connection is opened. |
| `--version`, `-v` | Print the package version to stdout and exit 0. |

The CLI has no upload, download, service-install, JSON-output, or remote-root flags. Use the FTP editor for transfers and YAML for configuration. The root is chosen on the remote endpoint, never by a client-side directory flag.

## Run and output

```sh
ptp --version
```

```text
0.3.0
```

```sh
ptp ./site.yaml
```

Successful startup includes a JSON log with message `FTP Server started at ftp://127.0.0.1:8021`. Other log fields, process IDs and timestamps vary. The default logger is JSON rather than a colorized progress display. npm itself may print additional script banners when using `npm start`.

The client stays in the foreground. Ctrl+C stops it. A second bridge using the same port fails to bind; set a different `port` for simultaneous profiles.

## Failures and streams

Running `ptp` without a profile writes `Usage: ptp <config.yaml>` to stderr and exits 1. A missing file, invalid configuration, or listener failure also exits 1. Runtime FTP operation failures are sent to the FTP editor; they do not necessarily stop the bridge.

Help/version use stdout. Operational logging uses the logger's stdout/stderr severity streams and files under the working directory's `logs` folder. Do not parse the whole terminal as one JSON document. Passwords and authorization request objects are excluded; usernames and endpoint paths may appear. Read [credentials and logs](../advanced/security#logs).

An empty remote directory is a successful FTP listing with no entries, not a startup error. For direct HTTP output, [list](/reference/api#actions) returns an empty `list` array. This is separate from the CLI's operational log format.

## Downloaded and source commands

| Installation | Run command | Build needed? |
| --- | --- | --- |
| npm executable | `ptp ./site.yaml` | No |
| Downloaded client ZIP | `npm start -- /absolute/path/to/site.yaml` | No |
| Source, compiled | `npm run build`, then `npm start -- config/site.yaml` | After source changes |
| Source watcher | `npm run dev -- config/site.yaml` | Compiles while running |

The compiled entry is `dist/index.js`; `dist/src/index.js` is also retained for existing workflows. `npm run dev` explicitly loads the local FTP declarations with `--files`.
