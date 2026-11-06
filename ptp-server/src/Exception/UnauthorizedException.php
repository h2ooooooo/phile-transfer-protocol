<?php

namespace jalsoedesign\PhileTransferProtocol\Exception;

class UnauthorizedException extends AbstractHttpCodeException {
    protected int $httpCode = 401;
}
