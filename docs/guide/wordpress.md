# WordPress plugin

If you can install a WordPress plugin, this is the shortest route. You do not need to compile or upload a standalone PHP endpoint.

Use this route to maintain approved plugins, themes, or uploads through an FTP editor on the client host. Obtain permission to install the plugin and edit those files. WordPress access alone does not authorize every file operation.

By default, the plugin exposes the active stylesheet directory, including the child theme when present. Under **Tools → PTP → Folder access**, choose a different root and select Plugins, Uploads, Themes, or individual folders in the tree.

## What you need

- WordPress 5.6+ and PHP 8.2+ with OpenSSL for encrypted requests.
- An HTTPS site.
- An administrator who is allowed to edit themes and install the plugin.
- Application Passwords enabled for the account.

The plugin respects WordPress file-edit and file-modification restrictions. It does not bypass a host's decision to disable editing.

## 1. Download and install the ZIP {#1-build-and-install-the-zip}

Download the [WordPress plugin ZIP](../downloads). In WordPress, open **Plugins > Add New > Upload Plugin**, upload that ZIP without extracting it, and activate it. The ZIP includes the shared PHP runtime; Composer and Node.js are not needed on the WordPress host. Source contributors can build their own ZIP using [the development workflow](../contributing/development).

## 2. Enable access

Open **Tools → PTP**. Check the displayed root, enable PTP access, save, and copy the endpoint URL.

Choose **Read/Write** or **Read only** beside Enable PTP access and save. Read only permits browsing and downloads and blocks all file changes at the API.

For plugin work, choose **Plugins** as the root. To combine plugins, uploads, and themes, choose **WordPress content** or **WordPress installation**, then use the preset checkboxes or expand folders in the tree. A custom absolute directory is also supported through **FTP root path → Browse root**.

Open folders with **+** or by clicking their names; **-** closes them. Files and folders have their own access checkboxes. Selecting a parent includes all current and future descendants. Uncheck a file or child folder to exclude it. Selecting a parent again clears child exceptions. **Save folder access** applies your changes; **Cancel changes** restores the saved root and selections. No changes apply while you browse.

Access is off by default. Deactivating the plugin clears the enabled setting, so reactivation requires enabling it again.

## 3. Create an Application Password {#create-application-password}

1. Sign in to the site's WordPress dashboard with your administrator account.
2. Open **Users → Profile**. You can also open your site's `/wp-admin/profile.php`.
3. Scroll to **Application Passwords**.
4. Enter `PTP maintenance` in **New Application Password Name**, then click **Add New Application Password**.
5. Copy the generated password now; WordPress will not display it again.
6. Put it in `apiPassword` in the YAML below. Set `apiUsername` to your WordPress login username, not the application name from step 4.

Use this generated password, not your normal login password. Spaces in the displayed password are accepted. See [WordPress's official creation instructions](https://developer.wordpress.org/advanced-administration/security/application-passwords/#creating-an-application-password-in-wp-admin).

### If the section is missing

Check that the site uses HTTPS. The host or a security plugin may have disabled Application Passwords; ask the administrator to check availability. Do not substitute your login password. See [WordPress's troubleshooting guidance](https://developer.wordpress.org/advanced-administration/security/application-passwords/#troubleshooting).

## 4. Download the profile and start the client {#4-connect-through-the-bridge}

Click **Download YAML** in Tools > PTP. It fills in the exact endpoint and the current login username. Replace the password placeholder with the Application Password, keeping the YAML quotes, and save the file as `wordpress.yaml` in a private directory on the client host. In Notepad choose All files when saving so the name does not become `wordpress.yaml.txt`.

Install the [client through npm or the compiled ZIP](./client-install). The npm-installed command is:

```sh
ptp ./wordpress.yaml
```

For the downloaded client folder, run `npm start -- /absolute/path/to/wordpress.yaml` inside that folder. Wait for the terminal message `FTP Server started at ftp://127.0.0.1:8021` and leave it open.

The downloaded configuration has this shape; you can also create it manually:

```yaml
host: 127.0.0.1
port: 8021
passiveUrl: 127.0.0.1
apiUsername: 'your-wordpress-username'
apiPassword: 'your dedicated application password'
apiEndPoint: 'https://example.com/wp-json/ptp/v1/files'
printCommands: false
```

Use the exact endpoint from the plugin screen. Without pretty permalinks it may contain a query string:

```yaml
apiEndPoint: 'https://example.com/?rest_route=/ptp/v1/files'
```

The bridge preserves that query parameter when it adds file actions.

Then [connect your editor](./editors) to `127.0.0.1:8021` using the same username and Application Password.

For a useful test, download a disposable file from a selected plugin folder, edit it on the client host, and upload it back to the same remote path. Read only mode permits the download and rejects the upload. FTP paths are relative to the root selected in Tools > PTP.

## When you finish: revoke the password {#revoke-application-password}

1. Under **Tools → PTP**, uncheck **Enable PTP access** and save.
2. Return to **Users → Profile → Application Passwords**.
3. Find `PTP maintenance` and click **Revoke** beside that entry. Confirm if prompted. Avoid **Revoke all** unless you intend to disconnect other integrations too.
4. Stop the local bridge and remove the obsolete password from your local configuration.

Disabling PTP alone does not revoke the credential. See [WordPress's password management instructions](https://developer.wordpress.org/advanced-administration/security/application-passwords/#managing-and-rotating-application-passwords).

## Where the password is stored

The plugin ZIP contains no site-specific password, and rebuilding it does not generate or rotate one. WordPress stores a hash of the Application Password; your local YAML contains the actual credential. See [WordPress's storage explanation](https://developer.wordpress.org/advanced-administration/security/application-passwords/#what-are-application-passwords).

PTP delegates authentication to WordPress, then checks HTTPS, explicit enablement, and administrator/theme-edit permissions. An Application Password retains the account's permissions outside PTP too. These are safeguards, not a guarantee that every deployment is secure. The [compiled standalone endpoint uses a different credential model](../advanced/security#standalone-credentials).

## Know the limits

- Switching the active theme changes the default root until you save a folder selection. A saved root stays fixed.
- A PHP error in a plugin or theme can stop WordPress from booting, which also stops this endpoint. Arrange another recovery route before editing live PHP.
- PTP writes directly to disk and does not run the WordPress editor's PHP validation.
- If only the theme file editor is available, someone still has to install the plugin ZIP for you. The ZIP and compiled standalone archive are not paste-in snippets.
- Every plugin action, including `hello`, requires Application Password authentication. An unauthenticated browser visit is not its health check.

For access errors, see [troubleshooting](./troubleshooting#ftp-connects-but-listing-fails). For replacement ZIPs and retained settings, see [updates](./updates#wordpress-plugin).
