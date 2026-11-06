<?php

namespace jalsoedesign\PhileTransferProtocol\Exception;

abstract class AbstractHttpCodeException extends \Exception {
    protected int $httpCode = 500;

    public function getHttpCode(): int {
        return $this->httpCode;
    }
}
