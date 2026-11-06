# Why would you need PTP?

You are allowed to maintain a website, but the usual way of getting files onto it is missing, unreliable, or awkward. The website still runs PHP and you have an approved way to install an endpoint or plugin. That is the gap PTP is designed to fill.

It gives your local FTP editor a route through the site's HTTPS connection, so you can work with files without repeatedly copying code into a browser editor.

## When it helps

| Situation | Why PTP can help |
| --- | --- |
| FTP connects, but listings or transfers fail | The remote transfer uses HTTPS instead of FTP's separate control and data connections |
| Remote FTP connections are unreliable on your network | An approved HTTPS route may work even when the FTP route does not |
| The host has an old or poorly maintained FTP service | PTP uses the PHP/HTTPS service, provided it meets the current runtime requirements |
| A client can give you WordPress administrator access but cannot arrange an FTP account | With approval to install the plugin, you can connect your editor to the active theme |
| A hosting file manager can upload files, but is painful for ongoing development | Use it once to install the standalone endpoint, then use your editor for routine changes |
| You only need to maintain one theme or directory | Configure that directory as the root instead of exposing the whole hosting account |

PTP is an alternative transfer route, not a guarantee that every broken connection will work. It cannot repair an unreliable internet connection, an unavailable website, exhausted PHP workers, or a server that refuses HTTPS requests.

## A familiar WordPress example

A client asks you to change their child theme. They give you administrator access and permission to do the work, but nobody can find the FTP account or get the old service working. Editing several files through the WordPress file editor quickly becomes tedious.

If the client approves installing PTP, you install the plugin, enable access, [create a dedicated Application Password](./wordpress#create-application-password), and run the bridge locally. Your editor connects to localhost; PTP carries the file operations to the active theme over HTTPS.

When the job is finished, [disable access and revoke the Application Password](./wordpress#revoke-application-password). You have a practical maintenance workflow with an explicit beginning and end.

The plugin defaults to the active theme. Its admin interface lets you select another root, choose individual folders, and use Read only permissions. See the [WordPress guide](./wordpress) for setup and limits.

## Other PHP sites and older hosting

The standalone endpoint can serve a selected directory on a PHP website you own or are authorized to maintain. It is useful when a hosting control panel can place the endpoint for you but cannot provide a convenient ongoing editing workflow.

The compiled version makes that handoff small: **one `ptp-server.php` file to upload**, with its code and settings bundled inside. Keep the bridge and build tools on the client host. See [what single-file deployment includes](./how-it-works#one-file-deployment).

Older hosting is a common reason to look for another transfer route, but PTP itself requires PHP 8.2+ and HTTPS. The compiled endpoint also needs Phar support. It does not make an obsolete PHP runtime compatible or update the host's software.

## When it is not the right tool

- If a reliable, approved SFTP or deployment workflow already meets your needs, you may not need another endpoint.
- If you only have permission to edit page content, that does not authorize installing a file-access tool or changing server files.
- If you can view a page but cannot deploy PHP or install a plugin, PTP cannot create that access.
- If the host or owner prohibits this kind of endpoint, obtain approval for another supported workflow.
- If WordPress cannot boot, its PTP plugin may be unavailable too. Keep an independent recovery route for live PHP edits.

::: danger Authorized maintenance only
PTP is absolutely not intended for malicious behavior. Unauthorized access, stealing data, planting malware, damaging a site, and retaining access after permission is withdrawn are unacceptable and prohibited by the project's [acceptable-use terms](../acceptable-use). Having credentials or finding a writable file does not, by itself, give you permission to use PTP.
:::

Ready to use it on an approved site? Follow [compile, upload, connect](./quick-start), or take the [WordPress plugin route](./wordpress).
