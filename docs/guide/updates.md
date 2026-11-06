# Update and roll back

Review the target version and test it before replacing live files. Keep the client and remote endpoint compatible; current clients require upload sessions. Preserve the private YAML and PHP configuration files separately from release code.

## npm client

After publication, review the installed and available versions, then choose a version explicitly:

```sh
ptp --version
npm view @jalsoedesign/phile-transfer-protocol-client version
npm install --global @jalsoedesign/phile-transfer-protocol-client@0.3.0
```

Stop the old process with Ctrl+C before starting the new executable with the same YAML. Installing an older version uses the same command with the chosen version number. Commands contacting the registry apply after publication; local prepared tarballs can be installed by filename instead.

## Downloaded client

Download the selected version, extract into a new directory, and run it against the existing private YAML. Keep the previous directory until verified. The release ZIP is compiled and bundles runtime dependencies; do not copy an old `dist` directory over the new release. Source users run `npm ci` and `npm run build` after updating source files.

## Standalone server ZIP

Back up `ptp.env` and the public entry point. Extract the selected server ZIP on the host, then deploy its `ptp-server/src` runtime tree to the matching private remote directory. Retain the existing private configuration. Review any example entry-point changes before applying them to your hosting paths. Check `hello`, authenticated listing, and a disposable upload/download before retiring the old runtime.

Rollback restores the previous runtime tree and uses configuration compatible with that version. If using a compiled endpoint, rebuild with the intended settings and upload the new PHP archive; updating a package alone cannot replace that deployed archive.

## Composer server

Review with `composer outdated jalsoedesign/phile-transfer-protocol-server`. Resolve an update with `composer update jalsoedesign/phile-transfer-protocol-server --with-dependencies`, test the changed lock file, then deploy it with `composer install --no-dev --prefer-dist`. Rollback deploys the previous lock file and installs that locked version. Keep `ptp.env` and the public bootstrap outside `vendor`.

## WordPress plugin

Download the versioned WordPress ZIP and replace the installed plugin through Plugins > Add New > Upload Plugin. Check Tools > PTP afterward. Existing settings are retained by the plugin; deactivation disables access, so re-enable it if you deactivated it during the update. Recheck the FTP root, file selections, and Permissions.

This release does not implement a custom dashboard updater. A plugin ZIP or Packagist package does not automatically create WordPress update notifications. WordPress.org distribution or a future updater would be separate work.

## Desktop client

The separate [Electron app](./desktop) reads `/releases/latest.json` for server/plugin downloads and verifies artifact sizes and checksums. It also uses prepared local release files before publication. Update its source checkout, install dependencies in `ptp-client-ui`, and rebuild before `npm start`. There is no automatic desktop or WordPress updater. The npm CLI remains independently usable.
