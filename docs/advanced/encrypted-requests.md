# Encrypted POST requests

PTP 0.3.0 sends bridge operations through an authenticated encrypted JSON POST to a fixed endpoint URL. File paths, action names, rename targets, upload session IDs, offsets, and uploaded bytes are inside the encrypted payload. A request for `/wp-config.php` does not expose that filename in its URL, headers, or JSON text.

This addresses filename and request-content false positives in intermediaries inspecting legitimate PTP transfers. It does not disable the hosting firewall or weaken PTP authorization. The standalone endpoint still enforces the configured root and protected paths; WordPress still enforces Application Password authentication, account permissions, folder selections, and Read only mode.

## Update an existing installation

1. Update the remote endpoint first. In WordPress, upload `ptp-wordpress-0.3.0.zip` through Plugins → Add New → Upload Plugin and replace the installed PTP plugin. Keep the existing settings and Application Password. Check Tools → PTP afterward, and re-enable access if the update process deactivated it.
2. For standalone PHP, deploy the updated `ptp-server/src` runtime, or rebuild and replace the compiled endpoint. Keep the existing private `ptp.env` and public bootstrap. The remote PHP runtime needs OpenSSL for encrypted requests.
3. Update the client to 0.3.0. Use the new compiled client ZIP, or update the source checkout and rebuild for compiled use. The desktop app also needs its updated source and build.
4. Stop and restart the bridge with the existing private YAML. No new encryption key, password, or endpoint URL is needed.
5. Reconnect the FTP editor and retry the failed transfers. Successful earlier transfers do not need to be repeated.

WordPress sites need the updated plugin, not a separate standalone server installation. Other PHP sites need the updated standalone server, not the WordPress plugin. Updated endpoints continue to support older clients.

## Configuration and compatibility

The client default is:

```yaml
requestTransport: encrypted
```

Existing YAML files inherit that default when run by the new client. For an endpoint that cannot yet be updated, explicitly choose:

```yaml
requestTransport: legacy
```

Legacy mode uses the existing action/path query API. It therefore retains the potential filename-filter false positives. There is no automatic plaintext fallback after an encrypted request fails. The desktop app defaults to encrypted requests; it preserves an explicit legacy setting imported from YAML.

Generic HTTP examples elsewhere in these docs show the still-supported legacy API. The FTP bridge and desktop access test use encrypted requests by default.

## Wire format

The HTTP request is `POST` to the configured API endpoint, retaining only any endpoint-routing query such as WordPress's `rest_route`. Headers include HTTP Basic authentication, `Content-Type: application/json`, and `X-PTP-Transport: encrypted-v1`.

The JSON envelope has `version: 1`, and base64-encoded `nonce`, `tag`, and `data` fields. These are ciphertext fields, not base64-encoded plaintext paths. Each request has a fresh random 12-byte nonce and a 16-byte authentication tag.

The protocol uses AES-256-GCM with additional authenticated data `PTP encrypted request v1`. Its 32-byte key is HKDF-SHA256 from the exact API password, with the nonce as salt and the same context string as HKDF info. Node uses its built-in crypto module; PHP uses `hash_hkdf` and OpenSSL. No custom cipher or word mapping is involved.

Before encryption, the binary plaintext contains a four-byte unsigned big-endian metadata length, UTF-8 JSON metadata, then raw upload bytes. Metadata contains `method` (`GET`, `POST`, or `DELETE`) and `parameters` (a map of strings including `action`). The logical method is validated against the action's existing method rule. Read only checks the logical operation, not the outer POST verb.

Metadata is limited to 16 KiB; decoded upload chunks to 512 KiB; encoded encrypted request bodies to 2 MiB. Upload sessions advertise that chunk limit. Normal encoded chunks remain below 1 MiB, including base64 overhead, to avoid increasing the previous bridge's wire size above common hosting limits. Unknown versions, malformed lengths, wrong tags, and invalid metadata fail without executing the operation. Existing raw API limits remain unchanged for legacy callers.

## Security boundary and remaining limits

HTTPS remains mandatory for remote endpoints. This extra encryption removes plaintext request signatures from ordinary inspection; it is not secrecy from a TLS-terminating intermediary that can inspect the Basic authentication credential used to derive the key. Nonces protect GCM encryption; they are not a request-replay prevention system.

Downloads remain binary streamed responses and listing/error responses remain ordinary JSON. This change does not conceal response contents from an inspecting intermediary, or resolve unrelated filesystem permissions, endpoint-wide blocking, or folder exclusions. A running bridge is not proof that a particular host accepts every request.

`npm run test:encrypted` exercises the real PHP endpoint behind a disposable local filter that rejects sensitive filename strings in request URLs and bodies. It verifies that the legacy request fails, encrypted reads succeed, binary uploads retain exact bytes, and authentication, integrity, method, and root restrictions still hold. WordPress adapter tests separately verify encrypted operations, folder exclusions, and read-only enforcement.
