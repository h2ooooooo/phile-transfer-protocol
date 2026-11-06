# Common HTTP tasks

These are contextual curl requests against the endpoint deployed in the [standalone quick start](../guide/quick-start). Replace `https://example.com/ptp-server.php` and `operator`. curl prompts for the password when only a username is supplied. On Windows use `curl.exe` to select the executable.

## List remote files

```sh
curl --user operator --get --data-urlencode 'action=list' --data-urlencode 'path=/' 'https://example.com/ptp-server.php'
```

`path=/` is the logical FTP/API root selected on the remote endpoint. It is not the operating system root or a local folder. Empty directories return `{"success":true,"path":"/","list":[]}`.

## Download to the client host

```sh
curl --user operator --get --data-urlencode 'action=read' --data-urlencode 'path=/notes.txt' --output ./notes.txt 'https://example.com/ptp-server.php'
```

Source: remote `/notes.txt`, relative to the endpoint root. Destination: `./notes.txt` in curl's working directory on the host.

## Write a small file

```sh
curl --user operator --request POST --header 'Content-Type: application/octet-stream' --data-binary @./notes.txt 'https://example.com/ptp-server.php?action=write&path=%2Fnotes.txt'
```

Source: local `./notes.txt` on the host. Destination: remote `/notes.txt`. This direct request overwrites the destination and is limited to 4 MiB. For larger files or a verified whole-file replacement use the FTP bridge or the [upload-session API](../reference/api#upload-session-api). Obtain permission before writes and keep executable PHP recoverable.

The [complete Node.js example](../examples/api-list) has synchronized language and run-command tabs, download files, and runnable error handling.
