<?php

use jalsoedesign\PhileTransferProtocol\Server;

require dirname(__DIR__) . '/vendor/autoload.php';

Server::run(dirname(__DIR__) . '/ptp.env');
