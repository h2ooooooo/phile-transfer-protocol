<?php

use PHPUnit\Framework\TestCase;
use jalsoedesign\PhileTransferProtocol\Config\Config;
use jalsoedesign\PhileTransferProtocol\Config\Environment;
use jalsoedesign\PhileTransferProtocol\Log\Logger;

class ConfigurationTest extends TestCase {
    private array $saved = [];
    protected function setUp(): void {
        foreach (['PTP_ENV_FILE', 'PTP_USERNAME', 'PTP_PASSWORD', 'API_USERNAME', 'API_PASSWORD', 'PTP_LOG_HEADERS', 'PTP_LOG_BODY'] as $key) {
            $this->saved[$key] = getenv($key);
            putenv($key);
        }

        putenv('PTP_ENV_FILE=');
    }
    protected function tearDown(): void {
        foreach ($this->saved as $key => $value) {
            putenv($value === false ? $key : $key . '=' . $value);
        }
        (new ReflectionProperty(Logger::class, 'instance'))->setValue(null, null);
    }
    public function testMissingCredentialsFailClosed(): void {
        $config = new Config();
        $values = Environment::load(__DIR__);
        $this->assertNull($values['apiUsername']);
        $this->assertNull($values['apiPassword']);
        $config->load($values);
        $this->expectException(Exception::class);
        $config->validate();
    }

    public function testExplicitPrivateFileSelectionPreservesEnvironmentPrecedence(): void {
        $selected = tempnam(sys_get_temp_dir(), 'ptp-selected-');
        $other = tempnam(sys_get_temp_dir(), 'ptp-other-');
        file_put_contents($selected, "PTP_USERNAME=selected\nPTP_PASSWORD=private-password\n");
        file_put_contents($other, "PTP_USERNAME=wrong-file\n");
        putenv('PTP_ENV_FILE=' . $other);

        try {
            $values = Environment::load(__DIR__, [], $selected);
            $this->assertSame('selected', $values['apiUsername']);
            $this->assertSame('private-password', $values['apiPassword']);
            $this->assertSame([['name' => $selected]], $values['ignoreFiles']);
            putenv('PTP_USERNAME=process');
            $this->assertSame('process', Environment::load(__DIR__, [], $selected)['apiUsername']);
        } finally {
            unlink($selected);
            unlink($other);
        }
    }
    public function testLegacyEnvironmentAndFalseBooleans(): void {
        putenv('API_USERNAME=legacy');
        putenv('API_PASSWORD=legacy-password');
        putenv('PTP_LOG_HEADERS=false');
        putenv('PTP_LOG_BODY=0');
        $values = Environment::load(__DIR__);
        $this->assertSame('legacy', $values['apiUsername']);
        $this->assertSame('legacy-password', $values['apiPassword']);
        $this->assertFalse($values['apiLogHeaders']);
        $this->assertFalse($values['apiLogBody']);
    }
    public function testDotEnvAndProcessPrecedence(): void {
        $file = tempnam(sys_get_temp_dir(), 'ptp-env-');

        try {
            file_put_contents($file, "API_USERNAME=from-file\nAPI_PASSWORD='quoted#secret'\n");
            putenv('PTP_ENV_FILE=' . $file);
            putenv('PTP_USERNAME=process-user');
            $values = Environment::load(__DIR__);
            $this->assertSame('process-user', $values['apiUsername']);
            $this->assertSame('quoted#secret', $values['apiPassword']);
        } finally {
            unlink($file);
        }
    }
    public function testLogsNeverContainCredentialsOrTransferredContents(): void {
        $file = tempnam(sys_get_temp_dir(), 'ptp-log-');

        try {
            Config::instance()->load(['apiLogPath' => $file, 'apiLogHeaders' => true, 'apiLogBody' => true, 'apiLogOutputConsole' => false]);
            (new ReflectionProperty(Logger::class, 'instance'))->setValue(null, null);
            Logger::getInstance()->log(200, 'POST', '/ptp.php', 'write', ['Authorization' => 'Basic SECRET', 'Cookie' => 'SESSION'], 'PRIVATE FILE CONTENT');
            $text = file_get_contents($file);
            $this->assertStringNotContainsString('SECRET', $text);
            $this->assertStringNotContainsString('SESSION', $text);
            $this->assertStringNotContainsString('PRIVATE FILE CONTENT', $text);
            $this->assertStringContainsString('[redacted]', $text);
            $this->assertStringContainsString('Body bytes: 20', $text);
        } finally {
            unlink($file);
        }
    }
    public function testPublicLogPathIsRejected(): void {
        $root = getenv('PTP_TEST_ROOT');
        $config = new Config();
        $config->load(['apiUsername' => 'test', 'apiPassword' => 'test', 'apiRootPath' => $root, 'apiLogPath' => $root . '/public.log']);
        $this->expectExceptionMessage('Logs must be outside');
        $config->validate();
    }
}
