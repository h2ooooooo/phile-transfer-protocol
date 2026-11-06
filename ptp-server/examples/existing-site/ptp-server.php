<?php

use jalsoedesign\PhileTransferProtocol\Server;

// The private ptp folder is a sibling of the website's public_html directory.
require dirname(__DIR__) . '/ptp/ptp-server/src/autoload.php';

Server::run(dirname(__DIR__) . '/ptp/ptp.env');
