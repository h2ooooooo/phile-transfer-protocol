# Transfers and recovery

PTP preserves raw file bytes and supports ordinary file operations. A whole FTP upload can involve several HTTP requests, which matters when editing a live site.

## Write modes

| Mode | Behavior |
| --- | --- |
| Overwrite | The bridge stages the complete replacement and commits after verification |
| Append | Writes at the current end of the file |
| Resume | Writes at the supplied offset, preserving the prefix and any untouched trailing bytes |
| Empty overwrite | Creates an empty file or truncates an existing one to zero bytes |

An offset must be a nonnegative integer no larger than the existing file. Append with a nonzero offset is rejected. Missing parent directories are created during a write.

Bridge uploads use verified sessions and preserve the original until commit. Direct write requests take an exclusive lock and check writes, seeking, flushing, and closing, but separate direct writes do not form one transaction.

## Read behavior

The API streams file reads in bounded buffers using `application/octet-stream`. Empty files and a file containing only `0` are preserved. Reading from an offset equal to EOF returns an empty stream.

Readers see the original until a bridge upload commits. Direct writes can be observed in progress. Each accepted raw request is bounded to 4 MiB.

## A safer way to update live files

1. Keep a known-good copy through a separate backup or recovery route.
2. Upload the new contents to a temporary non-executable filename in the same directory, such as `functions.php.ptp-upload`.
3. Confirm that the upload finished and verify the contents, for example by downloading the staged file and comparing it locally.
4. Rename the staged file into place when ready.

Replacement behavior depends on the host filesystem and its permissions. Test your editor's rename/overwrite behavior with disposable files first. Do not assume every host offers an atomic replacement, and do not delete the only working copy just to force a rename.

## WordPress has an extra dependency

The plugin needs WordPress to boot. If a theme edit causes a fatal PHP error during startup, PTP may become unavailable as well. A plugin endpoint cannot be your only recovery plan for the code required to load that plugin.

## Names, links, and permissions

Paths are relative to the selected root. Existing links in path components are rejected, including links used as a parent for a newly created file. Protected endpoint/configuration files are not listed or available through normal API file operations.

`chmod` accepts an octal string, such as `644` or `755`. Its practical effect depends on the operating system and hosting permissions. Do not assume Unix modes map directly to Windows ACLs.

## Verified upload sessions

The current bridge stages uploads through `uploadBegin`, `uploadWrite`, `uploadCommit`, and `uploadAbort`. It batches up to 1 MiB per request, maintains exact transfer offsets, and sends the payload size and SHA-256 at commit. The destination is replaced only after verification. Cancellation aborts the session; abandoned sessions expire after one hour. A changed destination causes a conflict rather than silently overwriting another transfer.

Append and resume copy the original into staging and preserve untouched bytes. Checksums cover the incoming payload. Atomic replacement requires the staging file and destination to share a filesystem. Native filesystem writers remain outside PTP's coordination locks. Deploy the updated endpoint or plugin alongside the bridge; the bridge requires the upload-session API.

Direct `write` requests remain available for integrations and are not whole-upload transactions. Each raw request is limited to 4 MiB. Downloads validate the binary media type and send an expected length; WordPress serving clears compatible output buffers to keep memory bounded.

Transfer metadata and locks require a writable private PHP temporary directory outside the served root. Staging files live beside the destination with mode 0600 and are hidden from API operations. There are at most 128 active sessions per root. A new session opportunistically cleans expired sessions. Duplicate or out-of-order chunks return 409; abort and restart after an uncertain write response.
