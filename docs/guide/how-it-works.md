# How PTP works

```text
FTP editor on client host
    -> plain FTP on 127.0.0.1:8021
PTP Node.js client on the same host
    -> authenticated HTTPS requests
Standalone PHP endpoint OR WordPress plugin on remote host
    -> selected remote filesystem root
```

The local FTP server exists only while the client process is running. The remote host runs PHP on HTTP requests; it does not need Node.js or a remote FTP service.

The standalone endpoint uses private PTP credentials and an absolute remote root. The WordPress plugin uses an administrator's Application Password, an enable switch, Read/Write or Read only permissions, and selectable files/folders. The plugin bundles its shared PHP runtime.

## Three different paths

| Value | Where it points |
| --- | --- |
| `site.yaml` | A private profile file on the client host |
| `apiEndPoint` | The public HTTPS URL of the remote PHP or WordPress API |
| `PTP_ROOT_PATH` / WordPress root | A filesystem directory on the remote host |
| FTP `/notes.txt` | A logical path beneath that selected remote root |

The client cannot expand its remote access by changing its working directory. PHP filesystem permissions and endpoint folder policies remain authoritative. [Transfers and recovery](../advanced/transfers) explains verification and cancellation.

## Optional single-file deployment {#one-file-deployment}

The [advanced compiler](../advanced/deployment#compiled-single-file-endpoint) can bundle the standalone endpoint and deployment defaults into one PHP archive. That differs from the unconfigured runtime ZIP, which keeps a private environment file outside the public entry point. WordPress uses its installable plugin ZIP and does not need that standalone archive.
