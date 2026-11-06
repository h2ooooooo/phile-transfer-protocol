# PTP for WordPress

Version 0.3.0 accepts encrypted JSON POST requests from the updated client and retains the legacy API for older clients. PHP OpenSSL is required for encrypted requests. Upload the new plugin ZIP to replace the installed plugin before updating the client. Keep existing settings, endpoint URL, and Application Password; check Tools → PTP afterward. No separate standalone server installation is needed for WordPress. See the [upgrade guide](https://h2ooooooo.github.io/phile-transfer-protocol/advanced/encrypted-requests.html).

WordPress adapter for the existing PTP client. Requires WordPress 5.6+, PHP 8.2+, HTTPS, and an administrator allowed to edit themes. Access is disabled by default. Until you save a folder selection, the root follows the active stylesheet (child theme when present) directory. WordPress file-edit/file-modification restrictions are respected.

## Install and connect

1. Download the WordPress ZIP from the [PTP downloads page](https://h2ooooooo.github.io/phile-transfer-protocol/downloads.html). Release files are prepared locally; this public download becomes available after publication.
2. Upload `ptp-wordpress-0.3.0.zip` through Plugins → Add New → Upload Plugin, then activate it.
3. Open Tools → PTP, enable access, save, and click **Download YAML**. The file includes your site's endpoint and your WordPress login username.
4. Open Users → Profile → Application Passwords, enter a task name, and click Add New Application Password. Copy the displayed password into `apiPassword` and your WordPress login username into `apiUsername`. See [WordPress's step-by-step instructions](https://developer.wordpress.org/advanced-administration/security/application-passwords/#creating-an-application-password-in-wp-admin).
5. Replace the downloaded file's `apiPassword` placeholder with that Application Password. With the npm client installed, run `ptp ./ptp-wordpress.yaml` from the directory containing the YAML. With the prebuilt client ZIP, run `node dist/index.js ./ptp-wordpress.yaml` from the extracted client directory. See the [client installation guide](https://h2ooooooo.github.io/phile-transfer-protocol/guide/client-install.html). The YAML is self-contained and does not require `_defaults.yaml`. Alternatively, configure the PTP client manually:

```yaml
host: 127.0.0.1
port: 8021
passiveUrl: 127.0.0.1
apiEndPoint: "https://example.com/wp-json/ptp/v1/files"
apiUsername: "your-wordpress-username"
apiPassword: "your dedicated application password"
printCommands: false
```

Use the exact endpoint displayed by WordPress, including `?rest_route=...` on sites without pretty permalinks. Connect your FTP editor to the local bridge using the same credentials. Ordinary WordPress login passwords and cookie authentication are not accepted by this endpoint. The web server must forward the Authorization header to PHP. Deactivating the plugin disables access; reactivation requires enabling it again.

Tools → PTP also shows your FTP connection details: host `127.0.0.1` (the client host), port `8021`, your WordPress login username, and instructions to use the same Application Password saved in your YAML. Select plain FTP (no TLS) and passive mode in your FTP editor. Start the local PTP client first. If you change the host or port in your local YAML, use those values in your FTP editor.

When finished, disable PTP under Tools, then return to Users → Profile → Application Passwords and click Revoke beside this task's entry. Application Passwords are WordPress account credentials, not restricted to this endpoint; protect the YAML file. See [WordPress's management instructions](https://developer.wordpress.org/advanced-administration/security/application-passwords/#managing-and-rotating-application-passwords).

The plugin ZIP contains no site-specific password. Rebuilding it does not generate or rotate credentials; WordPress manages the Application Password. This differs from the standalone compiled endpoint, which embeds its configured/generated password in the archive.

## Scope and recovery

Choose **Read/Write** or **Read only** beside Enable PTP access and click Save. Read only permits listing and downloads and rejects writes, folder creation, deletes, renames, and chmod at the API.

Under **Folder access**, select a root location or enter an absolute server directory and click Browse root. WordPress installation and WordPress content let you combine the Plugins, Uploads, and Themes presets. The Plugins root is useful when you only work on plugins.

Use **+** or click a folder name to open it; **-** closes it. Files and folders have separate access checkboxes. Checking a parent selects all its descendants, including future files and folders. Uncheck a file or child folder to exclude it, or select a descendant within an excluded branch. Intermediate directories remain navigable to reach selected descendants; other files there remain inaccessible. Selecting a parent again clears its child exceptions. **Save folder access** applies the draft; **Cancel changes** restores the saved root and selections. Large folders load in pages.

Folder exclusions apply to every file operation, not only directory listings. Renaming or changing permissions on a parent containing excluded folders is rejected. Symlink traversal is rejected by the shared filesystem. A saved custom root stays fixed when you switch themes. Deactivation disables access but keeps the saved root, folder rules, and Permissions choice.

Tools → PTP lists each failing WordPress access check, with guidance for enabling access, permissions, HTTPS detection, and file modification policies. Authenticated API errors include the same blocker messages, which the PTP client forwards in FTP error replies. Authentication failures explain that an Application Password and Authorization header forwarding are required. The admin status applies to the currently logged-in account; use that account's username in the local YAML.

Supports listing, stat, binary read/write, append/resume, mkdir, rename, delete, rmdir and chmod using the shared PTP filesystem implementation, within the selected root and folder rules. PHP filesystem permissions still apply.

Writes go directly to disk and bypass the editor's PHP validation. Upload to a temporary filename and rename after the upload completes. A syntax error in a plugin or theme can break WordPress bootstrap, including this plugin's endpoint: arrange backups and a recovery route before changing live PHP.

This is a normal installable plugin, not a single-file paste into the theme editor. A site that only permits theme editing still needs an administrator to install the ZIP first.

## Development

From the repository root, run `php ptp-wordpress/build.php` to build `ptp-wordpress/dist/ptp-wordpress.zip` (PHP zip extension required). For a source checkout of the client, save the YAML in `ptp-client/config/ptp-wordpress.yaml` and run `npm run dev -- config/ptp-wordpress.yaml` from `ptp-client` after `npm install`.

The ZIP bundles only the shared filesystem classes needed at runtime; no Composer install or separate server is required on WordPress. Within this monorepo, the plugin can load sibling `ptp-server/src` classes. Build again after changing shared code.

Run `npm run test:wordpress` for folder-selection and adapter tests with WordPress test doubles. These verify authorization gates, read-only enforcement, excluded folders, root selection, request validation, file operations and binary output, but do not replace a smoke test in a real WordPress installation. After editing SCSS, run `npm run build:wordpress:styles` before building the ZIP.
