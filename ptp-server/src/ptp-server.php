<?php

use jalsoedesign\PhileTransferProtocol\Api\Router;
use jalsoedesign\PhileTransferProtocol\Api\Controller\FileApiController;
use jalsoedesign\PhileTransferProtocol\Config\Config;
use jalsoedesign\PhileTransferProtocol\Config\Environment;
use jalsoedesign\PhileTransferProtocol\Api\Http\Request\EncryptedRequest;
use jalsoedesign\PhileTransferProtocol\Api\Http\Request\RequestParameterBag;

require_once(__DIR__ . '/autoload.php');

ini_set('display_errors', '0');

// Create a new Config instance directly
$config = Config::instance();

try {
    $archive = class_exists('Phar') ? \Phar::running(false) : '';
    $configuration = Environment::load($archive !== '' ? dirname($archive) : dirname(__DIR__), [
        'username' => '@config.apiUsernameBase64@',
        'password' => '@config.apiPasswordBase64@',
        'root' => '@config.apiRootPathBase64@',
        'log' => '@config.apiLogPathBase64@',
    ], $environmentFile ?? null);
    $configuration['ignoreFiles'][] = ['name' => $archive !== '' ? $archive : __FILE__];
    $configuration['ignoreFiles'][] = ['name' => $_SERVER['SCRIPT_FILENAME'] ?? __FILE__];
    $config->load($configuration);
    $config->validate();
} catch (\Throwable $e) {
    \jalsoedesign\PhileTransferProtocol\Api\Http\Response::json([
        'success' => false, 'error' => 'Server configuration is invalid',
    ], 503)->output();
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
$action = $_GET['action'] ?? '';

try {
    $router = new Router();
    $transport = $_SERVER['HTTP_X_PTP_TRANSPORT'] ?? '';
    $decoded = null;

    if ($transport !== '') {
        if ($transport !== EncryptedRequest::TRANSPORT || $method !== 'POST') {
            throw new \jalsoedesign\PhileTransferProtocol\Exception\HttpException(400, 'Unsupported PTP request transport', 'ptp_transport_invalid');
        }

        $router->authenticate();
        $decoded = EncryptedRequest::decode(RequestParameterBag::readRawBody(), $config->getApiPassword());
        $_GET = $decoded['parameters'];
        $action = $_GET['action'] ?? '';
        $method = $decoded['method'];
    }

    if (empty($method)) {
        throw new InvalidArgumentException('Request method is required');
    }

    if (empty($action)) {
        throw new InvalidArgumentException('A scalar action parameter is required');
    }

    $controller = new FileApiController($config->getApiRootPath(), $decoded['parameters'] ?? null, $decoded['body'] ?? null);

    // Define routes
    // NOTE: no chdir action, doesn't make sense with separate calls

    // Ping
    $router->addAction('GET', 'hello', [$controller, 'hello']);

    // Directories + Files
    $router->addAction('GET', 'get', [$controller, 'get']);
    $router->addAction('POST', 'rename', [$controller, 'rename']);
    $router->addAction('POST', 'chmod', [$controller, 'chmod']);
    $router->addAction('GET', 'getUniqueName', [$controller, 'getUniqueName']);

    // Directories
    $router->addAction('GET', 'list', [$controller, 'list']);
    $router->addAction('GET', 'listPage', [$controller, 'listPage']);
    $router->addAction('POST', 'mkdir', [$controller, 'mkdir']);
    $router->addAction('DELETE', 'rmdir', [$controller, 'rmdir']);

    // Files
    $router->addAction('POST', 'write', [$controller, 'write']);
    $router->addAction('POST', 'uploadBegin', [$controller, 'uploadBegin']);
    $router->addAction('POST', 'uploadWrite', [$controller, 'uploadWrite']);
    $router->addAction('POST', 'uploadCommit', [$controller, 'uploadCommit']);
    $router->addAction('POST', 'uploadAbort', [$controller, 'uploadAbort']);
    $router->addAction('GET', 'read', [$controller, 'read']);
    $router->addAction('DELETE', 'delete', [$controller, 'delete']);

    // Dispatch the request
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

    $router->dispatch($method, $path);
} catch (\Throwable $e) {
    $failure = \jalsoedesign\PhileTransferProtocol\Api\Http\HttpError::fromException($e);
    \jalsoedesign\PhileTransferProtocol\Api\Http\Response::json($failure['body'], $failure['status'], $failure['headers'])->output();
}
