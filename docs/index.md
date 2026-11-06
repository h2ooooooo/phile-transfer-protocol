---
layout: home
hero:
  name: PTP
  text: Your FTP editor. Your PHP hosting.
  tagline: Run a local FTP bridge on the host and manage selected files through HTTPS. Use the WordPress plugin or a standalone PHP endpoint.
  actions:
    - theme: brand
      text: WordPress quick start
      link: /guide/wordpress
    - theme: alt
      text: Standalone PHP quick start
      link: /guide/quick-start
    - theme: alt
      text: Downloads
      link: /downloads
---

## Choose your route

| You want to... | Start here |
| --- | --- |
| Edit WordPress plugins, themes, or uploads | [Install the WordPress plugin](./guide/wordpress) |
| Work with files on other PHP hosting | [Deploy the standalone PHP endpoint](./guide/quick-start) |
| Install or run the local bridge | [Client installation](./guide/client-install) |
| Automate requests from another tool | [API documentation](./api/) |
| Look up commands, arguments, or output | [CLI documentation](./cli/) |

## What you can do

Browse directories, download files, upload verified replacements, create folders, rename and delete files, and resume transfers. WordPress adds a browsable file tree, per-file and per-folder selections, and Read/Write or Read only permissions. The local bridge works with an ordinary FTP editor; the remote connection uses HTTPS.

Your editor connects to `127.0.0.1:8021` on the **client host**. The selected files live on the **remote PHP host**. No remote FTP service is required. [See the architecture](./guide/how-it-works).

Use PTP only with permission to install it and perform the intended operations. Changes to executable PHP take effect on the remote website; keep a recovery route available.

PTP is pronounced “Phile Transfer Protocol”, with “Phile” combining PHP and file.
