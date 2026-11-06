<?php

use PHPUnit\Framework\TestCase;

class CompilationTest extends TestCase {
    public function testCompilerFailuresPreservePreviousArtifactAndSuccessIsVerified(): void {
        $dir = sys_get_temp_dir() . '/ptp-compile-' . bin2hex(random_bytes(8));
        mkdir($dir . '/bin', 0755, true);
        mkdir($dir . '/src/Util', 0755, true);
        mkdir($dir . '/dist');
        copy(__DIR__ . '/../bin/compile.php', $dir . '/bin/compile.php');
        copy(__DIR__ . '/../src/Util/Utilities.php', $dir . '/src/Util/Utilities.php');
        copy(__DIR__ . '/../box.json', $dir . '/box.json');
        file_put_contents($dir . '/dist/ptp-server.php', 'PREVIOUS');
        $fake = <<<'PHP'
<?php
if (getenv('PTP_FAKE_MODE') === 'fail') exit(7);
if (getenv('PTP_FAKE_MODE') === 'missing') exit(0);
$config=json_decode(file_get_contents(substr($argv[2],9)),true);
file_put_contents($config['output'], "<?php echo 'built';");
PHP;
        file_put_contents($dir . '/fake.php', $fake);

        if (PHP_OS_FAMILY === 'Windows') {
            file_put_contents($dir . '/bin/box.cmd', "@echo off\r\n\"%PTP_TEST_PHP%\" \"%PTP_FAKE_BOX%\" %*\r\nexit /b %errorlevel%\r\n");
        } else {
            file_put_contents($dir . '/bin/box', "#!/bin/sh\nexec \"\$PTP_TEST_PHP\" \"\$PTP_FAKE_BOX\" \"\$@\"\n");
            chmod($dir . '/bin/box', 0700);
        }

        try {
            mkdir($dir . '/empty');

            foreach (['unavailable', 'fail', 'missing', 'success'] as $mode) {
                $env = getenv();

                foreach (array_keys($env) as $key) {
                    if (strcasecmp($key, 'PATH') === 0) {
                        unset($env[$key]);
                    }
                }

                $env = array_merge($env, ['PATH' => $dir . ($mode === 'unavailable' ? '/empty' : '/bin') . PATH_SEPARATOR . getenv('PATH'), 'PTP_TEST_PHP' => PHP_BINARY, 'PTP_FAKE_BOX' => $dir . '/fake.php', 'PTP_FAKE_MODE' => $mode, 'XDEBUG_MODE' => 'off']);
                $process = proc_open([PHP_BINARY, $dir . '/bin/compile.php', '--root-path=' . $dir, '--username=review', '--password=SECRET-COMPILE'], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $dir, $env);
                $stdout = stream_get_contents($pipes[1]);
                $stderr = stream_get_contents($pipes[2]);
                fclose($pipes[1]);
                fclose($pipes[2]);
                $code = proc_close($process);
                $this->assertStringNotContainsString('SECRET-COMPILE', $stdout . $stderr);

                if ($mode === 'success') {
                    $this->assertSame(0, $code, $stdout . $stderr);
                    $this->assertStringContainsString("echo 'built'", file_get_contents($dir . '/dist/ptp-server.php'));
                } else {
                    $this->assertNotSame(0, $code, $stdout . $stderr);

                    if ($mode === 'fail') {
                        $this->assertSame(7, $code, $stdout . $stderr);
                    }

                    $this->assertSame('PREVIOUS', file_get_contents($dir . '/dist/ptp-server.php'));
                }
            }
        } finally {
            $this->removeFixture($dir);
        }
    }
    private function removeFixture(string $path): void {
        foreach (array_diff(scandir($path), ['.', '..']) as $file) {
            $child = $path . '/' . $file;

            if (is_dir($child) && !is_link($child)) {
                $this->removeFixture($child);
            } else {
                unlink($child);
            }
        }

        rmdir($path);
    }
}
