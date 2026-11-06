# Connect your editor

Use an editor or file-transfer client that can connect to a plain FTP server on the client host. [Start PTP](./client-install) before connecting.

## Connection settings

Create an FTP connection with:

```text
Host:       127.0.0.1
Port:       8021
Protocol:   FTP
Encryption: Plain FTP
Mode:       Passive
Username:   apiUsername from site.yaml
Password:   apiPassword from site.yaml
```

Use the local address here. The website's HTTPS URL belongs in `apiEndPoint` in the PTP configuration, not in your editor's host field.

If the editor offers SFTP or “require explicit FTP over TLS”, choose ordinary FTP for this connection. The bridge is deliberately limited to loopback. The network connection to your website is HTTPS.

## First connection

1. Run the bridge with your site's YAML file.
2. Open the saved FTP connection in your editor.
3. List `/`. You should see the selected remote directory.
4. Transfer a small disposable text file in both directions.
5. Delete that test file when you have verified its contents.

Start with one transfer at a time, especially on shared hosting. Multiple requests can contend for PHP workers. The updated bridge stages and verifies each upload before committing it.

## Working on several sites

Keep a separate configuration file for each site. Run one bridge at a time on port 8021, or use distinct ports, such as 8021 and 8022, for simultaneous bridges. Give the editor connections clear names so you know which site a save will affect.

See [client configuration](../reference/client#multiple-sites) for a shared defaults file.

## Saves and live PHP

An editor's “save” may directly overwrite a live file. PTP does not validate PHP syntax or roll back a broken upload. Where your editor supports it, upload to a temporary file and rename after the transfer completes. Keep a recovery copy and an independent recovery route.

Directory listings work but downloads do not? Check that passive FTP is enabled and the local bridge is still running. More checks are in [troubleshooting](./troubleshooting).
