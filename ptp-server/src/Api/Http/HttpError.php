<?php

namespace jalsoedesign\PhileTransferProtocol\Api\Http;

use jalsoedesign\PhileTransferProtocol\Exception\AbstractHttpCodeException;
use jalsoedesign\PhileTransferProtocol\Exception\HttpException;

final class HttpError {
    /** Only explicitly public exceptions can supply a response message. */
    public static function fromException(\Throwable $error): array {
        $status = 500;
        $message = 'Internal server error';
        $code = 'ptp_internal_error';
        $headers = [];

        if ($error instanceof HttpException) {
            $status = $error->getHttpCode();
            $message = $error->getMessage();
            $code = $error->getErrorCode();
            $headers = $error->getHeaders();
        } elseif ($error instanceof AbstractHttpCodeException) {
            $status = $error->getHttpCode();
            $message = $error->getMessage();
            $code = $status === 404 ? 'ptp_not_found' : 'ptp_unauthorized';
        } elseif ($error instanceof \InvalidArgumentException) {
            $status = 400;
            $message = $error->getMessage();
            $code = 'ptp_invalid_request';
        }

        return [
            'status' => $status,
            'body' => ['success' => false, 'error' => $message, 'code' => $code],
            'headers' => $headers,
        ];
    }
}
