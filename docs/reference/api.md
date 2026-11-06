# HTTP API

Most users do not need this API directly. The bridge translates FTP operations for you. This reference is for integrations and debugging.

The bridge defaults to [encrypted JSON POST requests](../advanced/encrypted-requests) since 0.3.0. The query-based API below remains supported for existing integrations; its methods also describe the logical operations inside encrypted requests.

## Request format

Send the action and its parameters in the URL query string, including for POST and DELETE. Authenticate using HTTP Basic over HTTPS.

```text
https://example.com/ptp-server.php?action=list&path=%2F
```

Encode each parameter value individually. For example, a filename containing `&` must not become another query parameter. Do not put credentials in the URL.

The standalone `hello` action does not require authentication, but the server still validates its configuration first. All WordPress actions require Application Password authentication and plugin permission checks. See [how to create the credential](../guide/wordpress#create-application-password) and [how to revoke it](../guide/wordpress#revoke-application-password).

## Actions

| Method | `action` | Query parameters | Successful response |
| --- | --- | --- | --- |
| GET | `hello` | none | Raw `hi` |
| GET | `get` | `path` | `success`, `file`, `path` |
| GET | `list` | `path` | `success`, `list`, `path` |
| GET | `listPage` | `path`, optional `offset`, `limit` | `success`, `entries`, `nextOffset`, `path` |
| GET | `read` | `path`, optional `start` | Raw file bytes |
| POST | `write` | `path`, optional `append`, `start` | `success`, `path` |
| POST | `mkdir` | `path` | `success`, `path` |
| POST | `rename` | `from`, `to` | `success`, `from`, `to` |
| POST | `chmod` | `path`, `mode` | `success`, `path` |
| DELETE | `delete` | `path` | `success`, `path` |
| DELETE | `rmdir` | `path` | `success`, `path` |
| GET | `getUniqueName` | none | `success`, `uniqueName` |

The table describes the standalone response contract. The WordPress adapter preserves the fields needed by the bridge, but mutation responses use `path` plus operation fields such as `renamed` or `file`; do not assume its rename response contains standalone `from`/`to` fields.

Directories must be empty for `rmdir`; `delete` is for files. `chmod` takes an octal string, such as `644` or `755`. There is no server-side `chdir` action; each request identifies its own path.

## JSON and metadata

Fields are at the top level, not inside a `data` wrapper:

```json
{
  "success": true,
  "path": "/style.css",
  "file": {
    "name": "style.css",
    "size": 512,
    "modified": 1700000000,
    "isDirectory": false,
    "permissions": "644"
  }
}
```

`modified` is Unix time in seconds. `size` is a byte count. The bridge validates the metadata types and rejects malformed successful responses.

`list` returns a JSON array of the same metadata objects. Protected files and rejected links are omitted from listings.

`listPage` defaults to `offset=0` and `limit=100`, with a maximum limit of 500. Pass its returned `nextOffset` unchanged for the next page; `null` means finished. This is a pagination position, not a file byte offset or profile identifier. Directory changes between requests can affect pagination.

## Writes

Use a POST body containing the **raw file bytes**, with `Content-Type: application/octet-stream`. Do not use a JSON or multipart wrapper.

| Parameters | Meaning |
| --- | --- |
| `append=false&start=0` | Create or truncate, then write |
| `append=true&start=0` | Append to the end |
| `append=false&start=128` | Write at byte 128 without truncating |

Defaults are `append=false` and `start=0`. Use `true`/`false` or `1`/`0` for `append` across both endpoints. An offset cannot be negative or beyond EOF; append and a positive offset cannot be combined.

Empty overwrite bodies create or truncate empty files. Direct writes are per-request operations. The bridge uses the verified upload sessions below; see [transfers](../advanced/transfers).

## Reads

`read` returns raw bytes with `application/octet-stream`, including for HTML or JavaScript files. A `start` offset positions the stream; an offset at EOF returns no bytes. The endpoint sets no-store and nosniff headers.

## Try a read-only request

These examples use curl and prompt for the password when only a username is supplied. On Windows PowerShell, use `curl.exe` to select the curl executable.

```sh
curl --user operator --get --data-urlencode 'action=list' --data-urlencode 'path=/' 'https://example.com/ptp-server.php'
```

Download a file:

```sh
curl --user operator --get --data-urlencode 'action=read' --data-urlencode 'path=/style.css' --output style.css 'https://example.com/ptp-server.php'
```

## Errors

Standalone errors have a non-2xx status and this shape:

```json
{"success": false, "error": "message", "code": "ptp_invalid_request"}
```

WordPress errors use the standard WordPress shape:

```json
{"code": "ptp_read_only", "message": "PTP permissions are set to Read only. Change Permissions under Tools > PTP to allow file changes.", "data": {"status": 403}}
```

Common statuses include 400 for validated input errors, 401 for authentication or standalone forbidden-path errors, 403 for plugin access gates, 404 for missing paths/actions, 500 for operational failures, and 503 for invalid standalone startup configuration. Invalid parameters map to 400; operation conflicts map to 409. Treat all non-2xx responses as failures.

The bridge forwards recognized PTP access reasons, including excluded files and Read only mode, without passing Axios request objects containing credentials to FTP logs. Other failures use sanitized status-based messages. Multiple authenticated WordPress access blockers may appear in `data.blockers`.

## Upload session API

All session actions use POST and require authentication and write permission.

| Action | Query parameters | Result |
| --- | --- | --- |
| `uploadBegin` | `path`, optional `append`, `start` | `upload.id`, `upload.offset`, `upload.maxChunkSize` |
| `uploadWrite` | `uploadId`, exact transfer-relative `offset` | Updated `upload.offset`; raw body up to 4 MiB |
| `uploadCommit` | `uploadId`, payload `size`, payload `sha256` | Verified atomic replacement, `size`, `sha256`, `fileSize` |
| `uploadAbort` | `uploadId` | Discard staged transfer |

Offsets refer to newly uploaded payload bytes, including append/resume transfers. Duplicate or out-of-order chunks and destination changes return 409. Expired sessions return 410. Oversized bodies return 413. Invalid parameters return 400 and incorrect methods return 405 with `Allow`. Public errors include stable `ptp_*` codes; unexpected exception details remain private.
