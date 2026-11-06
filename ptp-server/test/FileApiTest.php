<?php

use jalsoedesign\PhileTransferProtocol\Util\Utilities;
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\Attributes\Depends;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Psr7\Response;

class FileApiTest extends TestCase {
    private Client $client;
    private string $baseUri = 'http://127.0.0.1:8016/ptp-server.php';
    private string $playgroundDir = __DIR__ . '/../playground';
    private string $testDir = 'test-dir-' . PHP_INT_MAX;
    private string $testFile = 'testFile.txt';

    protected function setUp(): void {
        $this->baseUri = getenv('PTP_TEST_ENDPOINT') ?: $this->baseUri;
        $this->playgroundDir = getenv('PTP_TEST_ROOT') ?: $this->playgroundDir;
        $apiUsername = 'test';
        $apiPassword = 'test';

        $authorizationHeader = sprintf(
            'Basic %s',
            base64_encode(sprintf('%s:%s', $apiUsername, $apiPassword))
        );

        $this->client = new Client([
            'base_uri' => $this->baseUri,
            'http_errors' => false,
            'headers' => [
                'Authorization' => $authorizationHeader,
            ],
        ]);
    }

    private function resolvePlaygroundPath($path) {
        return $this->playgroundDir . '/' . ltrim($path, '/');
    }

    /**
     * Test the hello endpoint
     */
    public function testHello(): void {
        $response = $this->safeGet('?action=hello');

        $this->assertEquals(
            200,
            $response->getStatusCode(),
            'Expecting HTTP 200 status code when accessing hello action'
        );
        $this->assertEquals(
            'hi',
            (string) $response->getBody(),
            'Expecting "hi" response from hello action'
        );
    }

    /**
     * Test getting file information
     */
    #[Depends('testHello')]
    public function testGetFileInfo(): void {
        // Test getting info for a text file
        $textFilePath = '/documents/index.txt';
        $response = $this->safeGet('?action=get&path=' . urlencode($textFilePath));

        $this->assertEquals(
            200,
            $response->getStatusCode(),
            'Expecting HTTP 200 status code when getting text file info'
        );

        $fileInfo = json_decode($response->getBody(), true);
        $this->assertIsArray($fileInfo);
        $this->assertArrayHasKey('file', $fileInfo);
        $this->assertEquals('index.txt', $fileInfo['file']['name']);
        $this->assertFalse($fileInfo['file']['isDirectory']);

        // Verify file exists in playground
        $this->assertFileExists(
            $this->resolvePlaygroundPath($textFilePath),
            'File should exist in playground directory'
        );

        // Test getting info for an image file
        $imagePath = '/music_albums/album_1/cover_alt.png';
        $response = $this->safeGet('?action=get&path=' . urlencode($imagePath));

        $this->assertEquals(
            200,
            $response->getStatusCode(),
            'Expecting HTTP 200 status code when getting image file info'
        );

        $fileInfo = json_decode($response->getBody(), true);
        $this->assertIsArray($fileInfo);
        $this->assertArrayHasKey('file', $fileInfo);
        $this->assertEquals('cover_alt.png', $fileInfo['file']['name']);
        $this->assertFalse($fileInfo['file']['isDirectory']);

        // Verify file exists in playground
        $this->assertFileExists(
            $this->resolvePlaygroundPath($imagePath),
            'Image file should exist in playground directory'
        );

        // Test getting info for a directory
        $dirPath = '/documents';
        $response = $this->safeGet('?action=get&path=' . urlencode($dirPath));

        $this->assertEquals(
            200,
            $response->getStatusCode(),
            'Expecting HTTP 200 status code when getting directory info'
        );

        $dirInfo = json_decode($response->getBody(), true);
        $this->assertIsArray($dirInfo);
        $this->assertArrayHasKey('file', $dirInfo);
        $this->assertEquals('documents', $dirInfo['file']['name']);
        $this->assertTrue($dirInfo['file']['isDirectory']);

        // Verify directory exists in playground
        $this->assertDirectoryExists(
            $this->resolvePlaygroundPath($dirPath),
            'Directory should exist in playground directory'
        );
    }

    /**
     * Test reading file contents
     */
    #[Depends('testHello')]
    public function testReadFile(): void {
        // Test reading a text file
        $textFilePath = '/documents/index.txt';
        $response = $this->safeGet('?action=read&path=' . urlencode($textFilePath));

        $this->assertEquals(
            200,
            $response->getStatusCode(),
            'Expecting HTTP 200 status code when reading text file'
        );

        $content = (string) $response->getBody();
        $this->assertNotEmpty($content, 'File content should not be empty');

        // Verify file exists and content matches
        $this->assertFileExists($this->resolvePlaygroundPath($textFilePath));
        $fileContent = file_get_contents($this->resolvePlaygroundPath($textFilePath));
        $this->assertEquals($fileContent, $content, 'API content should match file content');

        // Test reading an image file
        $imagePath = '/music_albums/album_1/cover_alt.png';
        $response = $this->safeGet('?action=read&path=' . urlencode($imagePath));

        $this->assertEquals(
            200,
            $response->getStatusCode(),
            'Expecting HTTP 200 status code when reading image file'
        );

        $content = (string) $response->getBody();
        $this->assertNotEmpty($content, 'Image content should not be empty');

        // Verify file exists and content matches
        $this->assertFileExists($this->resolvePlaygroundPath($imagePath));
        $fileContent = file_get_contents($this->resolvePlaygroundPath($imagePath));
        $this->assertEquals($fileContent, $content, 'API content should match image content');
    }

    /**
     * Test listing directory contents
     */
    #[Depends('testHello')]
    public function testListDirectory(): void {
        // Test listing root directory
        $response = $this->safeGet('?action=list&path=/');

        $this->assertEquals(
            200,
            $response->getStatusCode(),
            'Expecting HTTP 200 status code when listing root directory'
        );

        $listData = json_decode($response->getBody(), true);
        $this->assertIsArray($listData);
        $this->assertArrayHasKey('list', $listData);
        $this->assertIsArray($listData['list']);

        // Verify directories exist in playground
        $rootDirs = array_filter($listData['list'], function ($item) {
            return $item['isDirectory'] === true;
        });

        foreach ($rootDirs as $dir) {
            $this->assertDirectoryExists(
                $this->resolvePlaygroundPath('/' . $dir['name']),
                "Directory {$dir['name']} should exist in playground"
            );
        }

        // Test listing subdirectory
        $subDirPath = '/documents';
        $response = $this->safeGet('?action=list&path=' . urlencode($subDirPath));

        $this->assertEquals(
            200,
            $response->getStatusCode(),
            'Expecting HTTP 200 status code when listing subdirectory'
        );

        $listData = json_decode($response->getBody(), true);
        $this->assertIsArray($listData);
        $this->assertArrayHasKey('list', $listData);
        $this->assertIsArray($listData['list']);

        // Verify files and directories exist in playground
        foreach ($listData['list'] as $item) {
            $itemPath = $subDirPath . '/' . $item['name'];

            if ($item['isDirectory']) {
                $this->assertDirectoryExists(
                    $this->resolvePlaygroundPath($itemPath),
                    "Directory {$item['name']} should exist in playground"
                );
            } else {
                $this->assertFileExists(
                    $this->resolvePlaygroundPath($itemPath),
                    "File {$item['name']} should exist in playground"
                );
            }
        }
    }

    /**
     * Test directory creation and deletion
     */
    #[Depends('testHello')]
    public function testDirectoryCreationAndDeletion(): void {
        // Get the initial directory to make sure it doesn't exist
        $this->assertDirectoryDoesNotExist($this->resolvePlaygroundPath($this->testDir));

        $testDirString = sprintf('test dir (%s)', $this->testDir);

        $response = $this->safeGet('?action=get&path=' . urlencode($this->testDir));
        $this->assertEquals(
            404,
            $response->getStatusCode(),
            sprintf('404 when getting %s before creation', $testDirString)
        );

        $response = $this->safeGet('?action=list&path=' . urlencode($this->testDir));
        $this->assertEquals(
            404,
            $response->getStatusCode(),
            sprintf('404 when listing %s before creation', $testDirString)
        );

        // Create directory
        $response = $this->safePost('?action=mkdir&path=' . urlencode($this->testDir));
        $this->assertEquals(
            200,
            $response->getStatusCode(),
            sprintf('200 when creating initial %s', $testDirString)
        );

        // Verify directory exists in playground
        $this->assertDirectoryExists(
            $this->resolvePlaygroundPath($this->testDir),
            'Directory should exist in playground after creation'
        );

        $response = $this->safeGet('?action=get&path=' . urlencode($this->testDir));
        $this->assertEquals(
            200,
            $response->getStatusCode(),
            sprintf('200 when getting %s after creation', $testDirString)
        );

        $response = $this->safeGet('?action=list&path=' . urlencode($this->testDir));
        $this->assertEquals(
            200,
            $response->getStatusCode(),
            sprintf('200 when listing %s after creation', $testDirString)
        );

        // Delete directory
        $response = $this->client->delete('?action=rmdir&path=' . urlencode($this->testDir));
        $this->assertEquals(
            200,
            $response->getStatusCode(),
            sprintf('200 when deleting %s', $testDirString)
        );

        // Verify directory no longer exists in playground
        $this->assertDirectoryDoesNotExist(
            $this->resolvePlaygroundPath($this->testDir),
            'Directory should not exist in playground after deletion'
        );

        $response = $this->safeGet('?action=get&path=' . urlencode($this->testDir));
        $this->assertEquals(
            404,
            $response->getStatusCode(),
            sprintf('404 when getting %s after deletion', $testDirString)
        );
    }

    /**
     * Test file write, read, and delete operations
     */
    #[Depends('testHello')]
    public function testFileWriteReadAndDelete(): void {
        // Create directory
        $this->safePost('?action=mkdir&path=' . urlencode($this->testDir));
        $this->assertDirectoryExists(
            $this->resolvePlaygroundPath($this->testDir),
            'Test directory should exist after creation'
        );

        $filePath = $this->testDir . '/' . $this->testFile;
        $testContent = 'Test Content ' . time();

        // Write to file
        $response = $this->safePost('?action=write&path=' . urlencode($filePath), [
            'body' => $testContent,
        ]);
        $this->assertEquals(
            200,
            $response->getStatusCode(),
            'Expecting HTTP 200 status code when writing to file'
        );

        // Verify file exists in playground
        $this->assertFileExists(
            $this->resolvePlaygroundPath($filePath),
            'File should exist in playground after writing'
        );

        // Verify file content matches
        $fileContent = file_get_contents($this->resolvePlaygroundPath($filePath));
        $this->assertEquals(
            $testContent,
            $fileContent,
            'File content should match what was written'
        );

        // Check file content via API
        $response = $this->safeGet('?action=read&path=' . urlencode($filePath));
        $this->assertEquals(
            200,
            $response->getStatusCode(),
            'Expecting HTTP 200 status code when reading file'
        );
        $this->assertEquals(
            $testContent,
            (string) $response->getBody(),
            'API should return the same content that was written'
        );

        // Delete file
        $response = $this->client->delete('?action=delete&path=' . urlencode($filePath));
        $this->assertEquals(
            200,
            $response->getStatusCode(),
            'Expecting HTTP 200 status code when deleting file'
        );

        // Verify file no longer exists in playground
        $this->assertFileDoesNotExist(
            $this->resolvePlaygroundPath($filePath),
            'File should not exist in playground after deletion'
        );

        // Check file does not exist via API
        $response = $this->safeGet('?action=read&path=' . urlencode($filePath));
        $this->assertNotEquals(
            200,
            $response->getStatusCode(),
            'Should not get HTTP 200 status code when reading deleted file'
        );

        // Cleanup: Remove test directory
        $this->client->delete('?action=rmdir&path=' . urlencode($this->testDir));
        $this->assertDirectoryDoesNotExist(
            $this->resolvePlaygroundPath($this->testDir),
            'Test directory should not exist after cleanup'
        );
    }

    /**
     * Test file rename operation
     */
    #[Depends('testHello')]
    public function testRenameFile(): void {
        $newTestFile = 'newTestFile.txt';

        // Create directory and write to file
        $this->safePost('?action=mkdir&path=' . urlencode($this->testDir));
        $this->assertDirectoryExists(
            $this->resolvePlaygroundPath($this->testDir),
            'Test directory should exist after creation'
        );

        $filePath = $this->testDir . '/' . $this->testFile;
        $newFilePath = $this->testDir . '/' . $newTestFile;
        $testContent = 'Test Content for rename ' . time();

        $this->safePost(
            '?action=write&path=' . urlencode($filePath),
            ['body' => $testContent]
        );
        $this->assertFileExists(
            $this->resolvePlaygroundPath($filePath),
            'File should exist in playground after writing'
        );

        // Rename file
        $response = $this->safePost('?action=rename&from=' . urlencode($filePath) . '&to=' . urlencode($newFilePath));
        $this->assertEquals(200, $response->getStatusCode(), 'rename action did not return 200');

        // Verify original file no longer exists and new file exists in playground
        $this->assertFileDoesNotExist(
            $this->resolvePlaygroundPath($filePath),
            'Original file should not exist in playground after rename'
        );
        $this->assertFileExists(
            $this->resolvePlaygroundPath($newFilePath),
            'New file should exist in playground after rename'
        );

        // Check renamed file content
        $response = $this->safeGet('?action=read&path=' . urlencode($newFilePath));
        $this->assertEquals(200, $response->getStatusCode(), 'read after rename action did not return 200');
        $this->assertEquals(
            $testContent,
            (string) $response->getBody(),
            'Content should be preserved after rename'
        );

        // Verify file content matches via direct file access
        $fileContent = file_get_contents($this->resolvePlaygroundPath($newFilePath));
        $this->assertEquals(
            $testContent,
            $fileContent,
            'File content should match what was written after rename'
        );

        // Cleanup: Remove test directory and file
        $this->client->delete('?action=delete&path=' . urlencode($newFilePath));
        $this->assertFileDoesNotExist(
            $this->resolvePlaygroundPath($newFilePath),
            'New file should not exist after deletion'
        );

        $this->client->delete('?action=rmdir&path=' . urlencode($this->testDir));
        $this->assertDirectoryDoesNotExist(
            $this->resolvePlaygroundPath($this->testDir),
            'Test directory should not exist after cleanup'
        );
    }

    protected function tearDown(): void {
        $testDirPath = $this->resolvePlaygroundPath($this->testDir);

        if (file_exists($testDirPath)) {
            Utilities::removeDirectoryRecursively($testDirPath);
        }
    }

    private function safeGet(string $uri): Response {
        try {
            $response = $this->client->get($uri);

            return $response;
        } catch (GuzzleException $e) {
            $this->fail('HTTP GET request failed: ' . $e->getMessage());

            // This line is never reached but needed for type safety
            return new Response(500);
        }
    }

    private function safePost(string $uri, array $options = []): Response {
        try {
            /** @var Response $response */
            $response = $this->client->post($uri, $options);

            return $response;
        } catch (GuzzleException $e) {
            $this->fail('HTTP POST request failed: ' . $e->getMessage());

            // This line is never reached but needed for type safety
            return new Response(500);
        }
    }
}
