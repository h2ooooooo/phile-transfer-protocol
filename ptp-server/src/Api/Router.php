<?php

namespace jalsoedesign\PhileTransferProtocol\Api;

use jalsoedesign\PhileTransferProtocol\Api\Http\Response;
use jalsoedesign\PhileTransferProtocol\Config\Config;
use jalsoedesign\PhileTransferProtocol\Exception\AbstractHttpCodeException;
use jalsoedesign\PhileTransferProtocol\Exception\UnauthorizedException;
use jalsoedesign\PhileTransferProtocol\Log\Logger;

class Router {
    private array $routes = [];

    public function addAction($method, $action, $callback): void {
        $this->routes[$method][$action] = $callback;
    }

    public function dispatch(string $method = null, string $path = null): void {
        $method = $method ?? ($_SERVER['REQUEST_METHOD'] ?? '');
        $path = $path ?? (parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
        $response = $this->handle($method);
        $action = $_GET['action'] ?? null;
        $headers = [];

        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_') && is_string($value)) {
                $headers[str_replace('_', '-', substr($key, 5))] = $value;
            }
        }

        // Logging must never read a rejected request body or change its response.
        try {
            $logger = Logger::getInstance();

            if ($logger !== null) {
                $bodyBytes = filter_var($_SERVER['CONTENT_LENGTH'] ?? null, FILTER_VALIDATE_INT);
                $logger->log($response->httpCode, $method, $path, is_string($action) ? $action : null, $headers, null, $bodyBytes === false ? null : $bodyBytes);
            }
        } catch (\Throwable $error) {
            error_log('PTP request logging failed');
        }

        $response->output();
    }

    public function handle(string $method): Response {
        try {
            $action = $_GET['action'] ?? null;

            if (!is_string($action) || $action === '') {
                throw new \InvalidArgumentException('A scalar action parameter is required');
            }

            $allowed = [];

            foreach ($this->routes as $routeMethod => $actions) {
                if (isset($actions[$action])) {
                    $allowed[] = $routeMethod;
                }
            }

            if ($allowed === []) {
                throw new \jalsoedesign\PhileTransferProtocol\Exception\HttpException(404, 'Unknown action', 'ptp_not_found');
            }

            if (!isset($this->routes[$method][$action])) {
                throw new \jalsoedesign\PhileTransferProtocol\Exception\HttpException(405, 'Method not allowed', 'ptp_method_not_allowed', ['Allow' => implode(', ', $allowed)]);
            }

            if ($action !== 'hello') {
                $this->authenticate();
            }

            $params = $method === 'GET' ? $_GET : $_POST;

            return call_user_func($this->routes[$method][$action], $params);
        } catch (\Throwable $error) {
            $failure = \jalsoedesign\PhileTransferProtocol\Api\Http\HttpError::fromException($error);

            return Response::json($failure['body'], $failure['status'], $failure['headers']);
        }
    }

    public function authenticate(): void {
        $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';

        if ($authorization === '' && isset($_SERVER['PHP_AUTH_USER'], $_SERVER['PHP_AUTH_PW'])) {
            $authorization = 'Basic ' . base64_encode($_SERVER['PHP_AUTH_USER'] . ':' . $_SERVER['PHP_AUTH_PW']);
        }

        if (!is_string($authorization) || !str_starts_with($authorization, 'Basic ')) {
            throw new UnauthorizedException('Invalid authorization');
        }

        $decoded = base64_decode(substr($authorization, 6), true);

        if ($decoded === false || !str_contains($decoded, ':')) {
            throw new UnauthorizedException('Invalid authorization');
        }

        [$username, $password] = explode(':', $decoded, 2);
        $config = Config::instance();
        $usernameMatches = hash_equals($config->getApiUsername(), $username);
        $passwordMatches = hash_equals($config->getApiPassword(), $password);

        if (!$usernameMatches || !$passwordMatches) {
            throw new UnauthorizedException('Invalid authorization');
        }
    }
}
