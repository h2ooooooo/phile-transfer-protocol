<?php

namespace jalsoedesign\PhileTransferProtocol;

final class Server {
    /** Serve one HTTP request using deployment configuration outside the package. */
    public static function run(?string $environmentFile = null): void {
        require __DIR__ . '/ptp-server.php';
    }
}
