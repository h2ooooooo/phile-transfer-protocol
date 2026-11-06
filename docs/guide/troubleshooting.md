# Troubleshooting

## The client does not start

- **Node/npm not recognized:** install Node.js 22.13+ and reopen the terminal.
- **No `package.json`:** for a ZIP or source checkout, open the directory containing the client package before running npm commands.
- **Configuration not found:** pass the YAML file's actual path on the client host. Check it is not named `.yaml.txt`.
- **Old Hello World output:** rebuild an old source checkout, or replace it with a complete compiled release ZIP. Do not reuse stale `dist` files.
- **Development type error:** use the current `npm run dev` script, which includes `--files`; normal ZIP/npm users run compiled code and do not need a TypeScript watcher.
- **Port already in use:** stop the other bridge or choose another YAML `port` and use that port in the FTP editor.

## FTP connects but listing fails

Successful FTP login only verifies that the editor's credentials match the local YAML. The remote endpoint must separately authenticate and authorize the operation.

For WordPress open **Tools > PTP > Access status**. It explains disabled access, missing account capabilities, HTTPS detection and WordPress file-edit/file-modification policies. Verify an Application Password is used, the account matches `apiUsername`, and the host forwards Authorization headers. Read only and excluded file errors also appear in the FTP response.

For standalone PHP, HTTP 503 means required configuration is missing or invalid. Check the private `ptp.env` path and absolute remote root. HTTP 401 means authentication or path access failed. A `hello` response alone does not prove credentials or write permissions.

## Wrong host or transfer mode

The FTP editor connects to `127.0.0.1`, not the website hostname. Use plain FTP and passive mode. The website URL belongs in `apiEndPoint` and uses HTTPS. Use the final URL without redirects, including WordPress's `?rest_route=/ptp/v1/files` when present.

## Upload rejected or file missing

Confirm Write permission, parent-folder selections, PHP filesystem permissions, and a matching endpoint/client version. A 409 conflict means the transfer state or destination changed; refresh and restart the transfer. A 410 upload session has expired. A 413 response exceeds a chunk/body limit. Check the host's own proxy/upload limits as well.

Unexpected PHP/HTML output is not a valid binary download. Fix the remote error instead of saving the error page as a file. Keep a recovery route for plugin/theme edits that can break WordPress bootstrap.
