<?php

namespace jalsoedesign\PhileTransferProtocol\Exception;

class NotFoundException extends AbstractHttpCodeException {
    protected int $httpCode = 404;
}
