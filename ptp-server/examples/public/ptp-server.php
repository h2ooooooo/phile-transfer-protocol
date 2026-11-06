<?php

use jalsoedesign\PhileTransferProtocol\Server;

require dirname(__DIR__) . '/ptp-server/src/autoload.php';

Server::run(dirname(__DIR__) . '/ptp.env');
