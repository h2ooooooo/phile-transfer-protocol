# Update and roll back

Review the target version and test it before replacing live files. Keep the client and remote endpoint compatible; current clients require upload sessions. Preserve the private YAML and PHP configuration files separately from release code.

## npm client

Check the installed version, then download the selected [npm tarball](../downloads) and install it by filename:

```sh
ptp --version
npm install --global ./ptp-client-0.3.0.tgz
```

Stop the old process with Ctrl+C before starting the new executable with the same YAML. Installing an older version uses the same command with the chosen version number.

## Downloaded client

Download the selected version, extract into a new directory, and run it against the existing private YAML. Keep the previous directory until verified. The release ZIP is compiled and bundles runtime dependencies; do not copy an old `dist` directory over the new release. Source users run `npm ci` and `npm run build` after updating source files.

## Standalone server ZIP

Back up `ptp.env` and the public entry point. Extract the selected server ZIP on the host, then deploy its `ptp-server/src` runtime tree to the matching private remote directory. Retain the existing private configuration. Review any example entry-point changes before applying them to your hosting paths. Check `hello`, authenticated listing, and a disposable upload/download before retiring the old runtime.

Rollback restores the previous runtime tree and uses configuration compatible with that version. If using a compiled endpoint, rebuild with the intended settings and upload the new PHP archive; updating a package alone cannot replace that deployed archive.

## Composer server

Add the selected server ZIP to the artifact directory configured during [Composer installation](../server/composer). Resolve an update with `composer update jalsoedesign/phile-transfer-protocol-server --with-dependencies`, test the changed lock file, then deploy it with `composer install --no-dev --prefer-dist`. Rollback deploys the previous lock file and installs that locked version. Keep `ptp.env` and the public bootstrap outside `vendor`.

## WordPress plugin

Download the versioned WordPress ZIP and replace the installed plugin through Plugins > Add New > Upload Plugin. Check Tools > PTP afterward. Existing settings are retained by the plugin; deactivation disables access, so re-enable it if you deactivated it during the update. Recheck the FTP root, file selections, and Permissions.

## Desktop client

The separate [Electron app](./desktop) reads `/releases/latest.json` for server/plugin downloads and verifies artifact sizes and checksums. It can also load archives built from the source checkout. Update its source checkout, install dependencies in `ptp-client-ui`, and rebuild before `npm start`. There is no automatic desktop or WordPress updater. The npm CLI remains independently usable.
