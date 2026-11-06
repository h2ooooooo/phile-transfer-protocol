<?php

use PHPUnit\Framework\TestCase;
use GuzzleHttp\Client;
use GuzzleHttp\Psr7\Response;

class ErrorHandlingTest extends TestCase {
    private Client $client;
    private string $baseUri = 'http://127.0.0.1:8016/ptp-server.php';

    protected function setUp(): void {
        $this->baseUri = getenv('PTP_TEST_ENDPOINT') ?: $this->baseUri;
        $this->client = new Client([
            'base_uri' => $this->baseUri,
            'http_errors' => false,
            'headers' => [
                'Authorization' => 'Basic ' . base64_encode('test:test'),
            ],
        ]);
    }

    public function testMissingFileReturnsJsonError(): void {
        $response = $this->client->get('?action=get&path=non-existent-file.txt');

        $this->assertEquals(404, $response->getStatusCode());
        $this->assertEquals('application/json', $response->getHeaderLine('Content-Type'));

        $body = json_decode((string)$response->getBody(), true);
        $this->assertIsArray($body);
        $this->assertArrayHasKey('error', $body);
        $this->assertStringContainsString('does not exist', $body['error']);
    }

    public function testInvalidAuthorizationMissingHeader(): void {
        $client = new Client(['base_uri' => $this->baseUri, 'http_errors' => false]);
        $response = $client->get('?action=list&path=/');

        $this->assertEquals(401, $response->getStatusCode());
        $body = json_decode((string)$response->getBody(), true);
        $this->assertIsArray($body);
        $this->assertArrayHasKey('error', $body);
    }

    public function testInvalidAuthorizationWrongCredentials(): void {
        $client = new Client([
            'base_uri' => $this->baseUri,
            'http_errors' => false,
            'headers' => ['Authorization' => 'Basic ' . base64_encode('wrong:wrong')]
        ]);
        $response = $client->get('?action=list&path=/');

        $this->assertEquals(401, $response->getStatusCode());
        $body = json_decode((string)$response->getBody(), true);
        $this->assertIsArray($body);
    }

    public function testInvalidAction(): void {
        $response = $this->client->get('?action=invalid_action');

        $this->assertEquals(404, $response->getStatusCode());
        // Currently this might return text/html if not handled
        $this->assertEquals('application/json', $response->getHeaderLine('Content-Type'));
    }

    public function testInvalidMethod(): void {
        // 'get' action only supports GET
        $response = $this->client->post('?action=get&path=documents/index.txt');

        $this->assertEquals(405, $response->getStatusCode());
        $this->assertEquals('application/json', $response->getHeaderLine('Content-Type'));
    }

    public function testMissingActionParameter(): void {
        $response = $this->client->get(''); // No action param

        $this->assertEquals(400, $response->getStatusCode()); // Or 500 currently
        $this->assertEquals('application/json', $response->getHeaderLine('Content-Type'));
    }

    public function testPathTraversalAttempt(): void {
        $response = $this->client->get('?action=get&path=../../composer.json');

        $this->assertEquals(401, $response->getStatusCode()); // UnauthorizedException is thrown for root path violation
        $this->assertEquals('application/json', $response->getHeaderLine('Content-Type'));
    }

    public function testPathPrefixFlawAttempt(): void {
        // Try to access a path that starts with the same prefix but isn't actually a subpath
        // e.g., if root is "playground", try to access "playground-other" by going up and then using a prefix
        // Since we concatenate with root, this is harder to exploit via 'path' parameter directly
        // but we want to make sure the internal check is solid.
        // We can try using ".." to navigate just outside.

        $response = $this->client->get('?action=get&path=../playground-not-exists');

        // This should be caught as "Invalid root path" (401)
        $this->assertEquals(401, $response->getStatusCode());
        $body = json_decode((string)$response->getBody(), true);
        $this->assertEquals('Invalid root path', $body['error']);
    }

    public function testReadDirectoryAsFile(): void {
        $response = $this->client->get('?action=read&path=documents');

        $this->assertEquals(409, $response->getStatusCode());
        $body = json_decode((string)$response->getBody(), true);
        $this->assertStringContainsString('Cannot read the contents directory', $body['error']);
    }

    public function testDeleteDirectoryAsFile(): void {
        $response = $this->client->delete('?action=delete&path=documents');

        $this->assertEquals(409, $response->getStatusCode());
        $body = json_decode((string)$response->getBody(), true);
        $this->assertStringContainsString('Cannot use delete on a directory', $body['error']);
    }

    public function testMkdirAlreadyExists(): void {
        $response = $this->client->post('?action=mkdir&path=documents');

        $this->assertEquals(409, $response->getStatusCode());
        $body = json_decode((string)$response->getBody(), true);
        $this->assertStringContainsString('Directory already exists', $body['error']);
    }

    public function testRmdirOnNonEmptyDirectory(): void {
        // documents is not empty
        $response = $this->client->delete('?action=rmdir&path=documents');

        $bodyStr = (string)$response->getBody();
        $this->assertEquals(409, $response->getStatusCode(), "Expected 409 but got {$response->getStatusCode()}. Body: {$bodyStr}");
        $body = json_decode($bodyStr, true);
        $this->assertIsArray($body, "Body is not an array: {$bodyStr}");
        $this->assertArrayHasKey('error', $body, "No 'error' key in body: " . print_r($body, true));
        $this->assertStringContainsString('Directory is not empty', $body['error']);
    }

    public function testMkdirOnExistingFile(): void {
        $response = $this->client->post('?action=mkdir&path=documents/index.txt');

        $this->assertEquals(409, $response->getStatusCode());
        $body = json_decode((string)$response->getBody(), true);
        $this->assertStringContainsString('Directory already exists', $body['error']);
    }

    public function testWriteToPathWhereDirectoryExists(): void {
        $response = $this->client->post('?action=write&path=documents', [
            'body' => 'some content'
        ]);

        $this->assertEquals(409, $response->getStatusCode());
        $body = json_decode((string)$response->getBody(), true);
        // It should fail because fopen on a directory fails
        $this->assertArrayHasKey('error', $body);
    }
}
