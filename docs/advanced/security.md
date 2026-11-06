# Access and credentials

Give PTP the smallest directory that lets you do the job. A theme directory is a better default than an entire hosting account.

::: danger Malicious use is prohibited
PTP is absolutely not intended for malicious behavior. Unauthorized access, data theft, malware, sabotage, and maintaining access after authorization ends are unacceptable and violate the project's [acceptable-use terms](../acceptable-use). Obtain explicit authorization for both deployment and the intended file operations.
:::

## Where credentials travel

Your editor sends the configured username and password to the local loopback FTP bridge. The bridge uses HTTP Basic authentication over HTTPS to reach the remote endpoint.

Since 0.3.0, the bridge also encrypts request metadata and upload bytes inside JSON POST requests. This removes plaintext filename patterns from ordinary request inspection. It does not replace HTTPS or hide credentials from a TLS-terminating intermediary. [Protocol and update order](./encrypted-requests).

Plain FTP is limited to the local machine. The bridge rejects non-loopback bind addresses. Do not weaken that boundary to share it over a network.

## Keep these files private

- Local client YAML files contain passwords.
- Generated `tmp/.ptp-credentials.json` contains the compiled endpoint's credential.
- Compiler configuration files can contain a password.
- A compiled archive contains its embedded defaults. Base64 encoding is not encryption.
- Environment files can contain the runtime override credentials.

Do not publish these in repositories or attach them to bug reports. The example filenames in this repository are ignored where appropriate, but an arbitrary file you create elsewhere may not be.

## Runtime boundaries

The API checks the selected root, rejects existing links during path traversal, and protects the endpoint and selected environment file. It also prevents removing the root or renaming an ancestor of protected files.

These checks do not make an authenticated user who can upload executable PHP harmless. If another web server executes a file they write, that code runs with the web server's permissions. Operating-system permissions and the hosting account remain the underlying boundary. The API also cannot isolate itself from a hostile local process racing filesystem changes.

## WordPress credentials

Follow the [step-by-step instructions to create an Application Password](../guide/wordpress#create-application-password), including exactly what to put in the client YAML. When finished, follow the [revocation steps](../guide/wordpress#revoke-application-password). The [official WordPress guide](https://developer.wordpress.org/advanced-administration/security/application-passwords/) also covers creation and management.

It remains a WordPress account credential with the account's permissions, not a token scoped only to PTP. The plugin separately requires administrator/theme-edit capabilities, HTTPS, and explicit enablement. No site password is embedded in the plugin ZIP; building it does not rotate credentials. See [where the WordPress password is stored](../guide/wordpress#where-the-password-is-stored).

## Standalone credentials

The standalone compiler can generate a fresh random 32-character password for each build, using PHP's cryptographic random generator. This happens when no password is supplied through the CLI, build configuration, or environment, or when you explicitly use `--password='%GENERATE_PASSWORD%'`.

**The compiled endpoint does contain that password**, embedded as a base64-encoded default. It is not encrypted or stored as a password hash. The compiler also saves a local copy in `tmp/.ptp-credentials.json`; that file stays on the client host and must not be uploaded. An attacker who obtains the archive can recover the embedded credential.

A generated credential avoids a shared default password, and HTTPS protects it in transit. It does not make the endpoint automatically secure. Keep the archive private, deploy it where PHP executes it, and restrict the selected root.

To rotate the embedded credential, compile with a new generated password, replace the deployed endpoint, and update the bridge YAML. Compiling locally alone does not change the running server. Runtime overrides still take precedence, and old reachable copies retain their own credentials until removed or replaced.

## Logs

Server logs omit query strings and redact sensitive headers. Optional body logging records byte counts rather than file contents. The bridge suppresses raw FTP trace logging because FTP commands can contain credentials.

Treat logs as operational data: they may still contain usernames, endpoint locations, errors, and local paths. Check them before sharing.

## Finish the job

Stop the bridge. Remove or restrict a temporary standalone endpoint, or [disable WordPress access and revoke its Application Password](../guide/wordpress#revoke-application-password). Remove obsolete reachable copies when deploying a new endpoint.

For a long-lived setup, keep PHP and dependencies updated, use HTTPS, and retain a separate recovery route.
