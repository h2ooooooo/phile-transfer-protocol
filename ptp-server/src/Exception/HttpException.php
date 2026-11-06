<?php

namespace jalsoedesign\PhileTransferProtocol\Exception;

class HttpException extends AbstractHttpCodeException {
    private string $errorCode;
    private array $headers;

    public function __construct(int $status, string $message, string $errorCode, array $headers = []) {
        parent::__construct($message);
        $this->httpCode = $status;
        $this->errorCode = $errorCode;
        $this->headers = $headers;
    }

    public function getErrorCode(): string {
        return $this->errorCode;
    }

    public function getHeaders(): array {
        return $this->headers;
    }
}
