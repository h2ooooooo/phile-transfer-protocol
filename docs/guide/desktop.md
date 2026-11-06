# Desktop connection manager

`ptp-client-ui` is a separate Electron app for configuring and running the existing PTP client. Save connections, import the WordPress YAML, run multiple bridges, inspect client logs, and download either remote endpoint.

## Install and run

This iteration runs from the repository. Install Node.js 22.13+ with npm, extract or clone the repository, and open a terminal in `ptp-client-ui`:

```sh
npm install
npm run dev
```

On first run, the script installs the sibling client's dependencies if needed and builds `ptp-client`. Electron downloads its runtime on first use. Initial setup needs network access. No `npx` command is required.

For compiled use:

```sh
npm run build
npm start
```

Build again after source changes. The CLI and existing client ZIP still work independently. There is no desktop installer or published desktop npm package yet.

## Add and test a connection

1. Click **New connection**, or **Import YAML** and select the self-contained YAML downloaded from Tools → PTP in WordPress.
2. Set the exact endpoint, username, and API password. WordPress requires an Application Password, created under Users → Profile.
3. Choose a local FTP port, initially `8021`. Use a different port for each concurrent connection.
4. Save, then click **Test access** to authenticate and list the remote root. The app displays the endpoint's blocker message when possible. An HTML gateway failure is identified as a non-PTP response.
5. Click **Start bridge** and wait for **Running**. Connect the FTP editor using the displayed local details, plain FTP, and passive mode.

The same password authenticates the FTP editor and the remote API. The password copy button places the saved password on the system clipboard. The remote root and folder permissions are configured in the [WordPress plugin](./wordpress) or the [standalone server](./quick-start), not in this local bridge.

Each bridge has its own process, local port, status, and log. Stopping one leaves others running. Stop before editing or deleting that connection. Closing PTP stops all bridges and disconnects active FTP sessions.

## Download the endpoint

Before the public release service is published, run `npm run release:build` from the repository root and restart the app. **Downloads** then offers the prepared WordPress and standalone server ZIPs, with installation steps. Choose a destination in the Save dialog. Size and SHA-256 are verified before saving the finished ZIP.

**Check for releases** reads the [GitHub Pages release manifest](/releases/latest.json). Remote refresh accepts only a manifest marked as published; until then, prepared local downloads remain available. Downloads do not upload or install files remotely. Follow the [WordPress installation](./wordpress) or [standalone PHP upload guide](./quick-start).

## Passwords and logs

Saved passwords use operating-system encryption in Electron's per-user PTP data directory. An unavailable or locked keyring prevents saving; Linux plaintext fallback is refused. Profiles are not intended as portable credential backups. Keep the original Application Password or API credential available when moving to another host.

The UI displays the latest 500 log entries per connection, with known passwords redacted. The underlying client also keeps log files in the per-user PTP data directory. Clearing the displayed log does not delete those files. Importing YAML leaves the original file untouched, including any plaintext password it contains.

The developer browser preview on port 5184 uses synthetic examples and has no desktop capabilities. The actual Electron development window uses port 5183. VitePress ports remain 5173 and 4173.
