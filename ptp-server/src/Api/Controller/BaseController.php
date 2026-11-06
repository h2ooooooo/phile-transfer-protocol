<?php

namespace jalsoedesign\PhileTransferProtocol\Api\Controller;

abstract class BaseController {
    protected function returnResponse($output) {
        header('Content-Type: application/json');

        echo json_encode($output);
    }

    protected function returnError($httpCode, $errorMessage, $errorCode = 0) {
        http_response_code($httpCode);

        $this->returnResponse(['error' => $errorMessage, 'code' => $errorCode]);
    }
}
