import {Socket} from 'net';

export function observeFtpAbort(socket: Socket | undefined, abort: () => void): () => void {
    if (!socket) {
        return () => {};
    }

    let command = '';
    let oversized = false;
    const onData = (bytes: Buffer) => {
        for (const character of bytes.toString('utf8')) {
            if (character === '\n') {
                const directive = command.replace(/"/g, '').trim().split(/\s/, 1)[0].toUpperCase();

                if (!oversized && directive === 'ABOR') {
                    abort();
                }

                command = '';
                oversized = false;

                continue;
            }

            if (!oversized) {
                if (command.length >= 4096) {
                    command = '';
                    oversized = true;
                } else {
                    command += character;
                }
            }
        }
    };

    // The FTP engine acknowledges ABOR without destroying the upload stream.
    socket.on('data', onData);

    return () => socket.off('data', onData);
}
