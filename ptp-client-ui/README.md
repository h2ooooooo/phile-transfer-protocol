# PTP desktop client

Version 0.3.0 uses the client's encrypted POST transport for bridges and access tests. Update the remote WordPress plugin or standalone server first. Existing saved connections and passwords remain usable; no extra encryption key is required.

`ptp-client-ui` is a separate Electron application. It uses the sibling `ptp-client` implementation in isolated Node utility processes. The existing `ptp` CLI remains independently usable.

## Run from this repository

The development toolchain uses Vite 8 and TypeScript 6. Vue's current type checker depends on Volar, which requires TypeScript below 7. Keep the Node type definitions on the supported Node 22 line when updating dependencies.

Install Node.js 22.13+ with npm, then open a terminal in `ptp-client-ui`:

```sh
npm install
npm run dev
```

The first development run installs the sibling client's dependencies with `npm ci` if needed and builds it. Electron downloads its official runtime on first use, so initial setup requires network access. The Vue interface reloads after edits; Electron restarts when its main process changes. The renderer development port is 5183.

When editing the shared client's TypeScript, run `npm --prefix ../ptp-client run watch` in another terminal. Restart the affected bridge to load its rebuilt code; the rest of the desktop app can stay open.

For a compiled local run:

```sh
npm run build
npm start
```

Run `npm run build` after updating source files.

## Connections

1. Click **New connection**, or **Import YAML** to select a self-contained PTP profile, including the WordPress download.
2. Enter a name, exact API endpoint, username, password, and local FTP port. For WordPress, use an Application Password from Users → Profile.
3. Save, then optionally **Test access**. This authenticates and lists the endpoint root; it does not test writes or change remote files.
4. Click **Start bridge**. Wait for **Running** and the client startup log.
5. Connect the FTP editor to the displayed host, port, and credentials, using plain FTP and passive mode. Copy buttons include the saved password; copying it puts it on the system clipboard.

Multiple connections can run together on distinct local ports. New profiles suggest the next unused saved port. Port conflicts, endpoint errors, and client failures remain visible. Stopping one connection leaves others running. Stop a connection before editing or deleting it. Closing the app stops every bridge, disconnecting FTP sessions.

Imported YAML is reviewed before saving. YAML inheritance via `extends` is deliberately rejected; merge the settings first. Import does not change or delete the original YAML, which may contain a plaintext password.

The desktop bridge uses IPv4 loopback `127.0.0.1`. Imported `localhost` or `::1` FTP addresses are normalized to that address; non-loopback profiles are rejected.

## Downloads

From the repository root, prepare artifacts once:

```sh
npm run release:build
```

Restart the UI. **Downloads** offers the server and WordPress ZIPs, install steps, and SHA-256 details. Choose the destination in the native Save dialog. Files are size-checked and checksum-checked before replacing the destination. No remote installation happens automatically.

**Check for releases** reads `https://h2ooooooo.github.io/phile-transfer-protocol/releases/latest.json`. Download URLs must match the expected filenames and stay on that HTTPS origin. Archives built from source remain available after a failed check. The renderer never loads remote content or executes downloaded files.

## Local storage

Profiles live in Electron's per-user PTP data directory, typically `%APPDATA%/PTP/connections.json` on Windows. Passwords are encrypted with Electron `safeStorage`, backed by the operating system. They are unlocked only to start a bridge, test access, or copy a password. On Linux, an unlocked supported secret service is required; plaintext `basic_text` fallback is refused. Moving encrypted profiles to another account or host may require entering passwords again.

Each worker writes the existing client's logs under the same PTP data directory in `bridges/<profile-id>/logs`. The UI keeps the latest 500 entries per connection in memory and redacts known passwords and Basic authorization values. Clear log clears the in-memory view, not the client's files. Deleting a profile removes its stored credential but retains historical client log files. Bridge runtime processes never write a credential YAML.

## Checks

```sh
npm run check
npm test
npm run build
npm run test:desktop
```

The desktop smoke check runs two real client workers against a disposable localhost HTTP fixture, logs into both through FTP, checks port conflicts and shutdown, exercises OS encryption, and loads the sandboxed renderer/preload. It does not connect to a live site.

`npm run preview:web` opens a visual fixture at `http://127.0.0.1:5184/`. It uses explicitly synthetic profiles and cannot start bridges, save credentials, or download files. Use Electron for real desktop actions.
