<?php

/**
 * Usage: @composer run compile --root-path=<path> --username=<user> [--password=<pass>] [--log-path=<log>] [--config=<yml>]
 * @param string --root-path The parameter to define which "root path" to serve.
 * @param string --username The parameter to define a static API username.
 * @param string --password The parameter to define a static API passwords. Defaults to a random 32 character string if %GENERATE_PASSWORD% is used.
 * @param string --log-path The parameter to define the API log path.
 * @param string --config   The path to a YAML configuration file.
 */
require_once(__DIR__ . '/../src/Util/Utilities.php');

function generateRandom($length) {
    return substr(bin2hex(random_bytes($length)), 0, $length);
}

function parseArgs($argv) {
    $params = [];

    foreach ($argv as $arg) {
        if (strpos($arg, '--') === 0) {
            $parts = explode('=', substr($arg, 2), 2);
            $key = $parts[0];
            $value = $parts[1] ?? true;
            $params[$key] = $value;
        }
    }

    return $params;
}

function parseYaml($content) {
    $lines = explode("\n", $content);
    $data = [];

    foreach ($lines as $line) {
        $line = trim($line);

        if (empty($line) || $line[0] === '#') {
            continue;
        }

        $parts = explode(':', $line, 2);

        if (count($parts) === 2) {
            $key = trim($parts[0]);
            $value = trim($parts[1]);

            // Remove quotes if present
            if (preg_match('/^["\'](.*)["\']$/', $value, $matches)) {
                $value = $matches[1];
            }

            $data[$key] = $value;
        }
    }

    return $data;
}

function isCommandAvailable($command) {
    switch (PHP_OS_FAMILY) {
        case 'Windows':
            $checkCommand = sprintf('where %s', $command);

            break;
        default:
            $checkCommand = sprintf('command -v %s', $command);

            break;
    }

    $output = shell_exec($checkCommand);

    return !empty($output);
}

// Check box existence
if (!isCommandAvailable('box')) {
    printf('"box" command does not appear to be installed' . PHP_EOL);
    printf('Please follow the documentation here: https://github.com/box-project/box/blob/main/doc/installation.md#github' . PHP_EOL);

    exit(1);
}

$cliArgs = parseArgs($argv);

// Default to environment variables
$rootPath = getenv('PTP_ROOT_PATH') ?: null;
$username = getenv('PTP_USERNAME') ?: null;
$password = getenv('PTP_PASSWORD') ?: null;
$logPath = getenv('PTP_LOG_PATH') ?: '';

// If config is provided, load it
if (isset($cliArgs['config'])) {
    $configPath = $cliArgs['config'];

    if (!file_exists($configPath)) {
        printf('Config file not found: %s' . PHP_EOL, $configPath);
        die(1);
    }

    printf('Loading config from %s..' . PHP_EOL, $configPath);
    $configData = parseYaml(file_get_contents($configPath));

    $rootPath = $configData['root-path'] ?? $rootPath;
    $username = $configData['username'] ?? $username;
    $password = $configData['password'] ?? $password;
    $logPath = $configData['log-path'] ?? $logPath;
}

// CLI overrides
$rootPath = $cliArgs['root-path'] ?? $rootPath;
$username = $cliArgs['username'] ?? $username;
$password = $cliArgs['password'] ?? $password;
$logPath = $cliArgs['log-path'] ?? $logPath;

// Handle legacy positional arguments if named ones are missing
if (empty($rootPath)) {
    $rootPath = $argv[1] ?? null;
}

if (empty($username)) {
    $username = $argv[2] ?? null;
}

if (empty($password)) {
    $password = $argv[3] ?? null;
}

// Handle random password generation
$generatedPassword = $password === '%GENERATE_PASSWORD%' || empty($password);

if ($generatedPassword) {
    $password = generateRandom(32);
}

// Validate required fields
if (empty($rootPath)) {
    printf('Error: --root-path is required (or PTP_ROOT_PATH env var, or config file).' . PHP_EOL);
    die(1);
}

if (empty($username)) {
    printf('Error: --username is required (or PTP_USERNAME env var, or config file).' . PHP_EOL);
    die(1);
}

$replacements = [
    'config.apiRootPathBase64' => base64_encode($rootPath),
    'config.apiUsernameBase64' => base64_encode($username),
    'config.apiPasswordBase64' => base64_encode($password),
    'config.apiLogPathBase64' => base64_encode($logPath),
];

// Read current config
printf('Reading box config..' . PHP_EOL);
$boxConfigRaw = file_get_contents(__DIR__ . '/../box.json');
$boxConfig = json_decode($boxConfigRaw, true);

// Create temp config adding replacements
printf('Creating new temporary box config..' . PHP_EOL);
$tempDirectory = __DIR__ . '/../tmp';

if (!file_exists($tempDirectory)) {
    mkdir($tempDirectory, 0777, true);
}

$tempDirectory = realpath($tempDirectory);

$tempConfigPath = $tempDirectory . '/box-' . bin2hex(random_bytes(12)) . '.json';

$compileConfig = array_merge($boxConfig, ['replacements' => $replacements]);
$compileConfig['base-path'] = realpath(__DIR__ . '/../src');
$outputDirectory = __DIR__ . '/../dist';

if (!is_dir($outputDirectory) && !mkdir($outputDirectory, 0755, true)) {
    exit(1);
}

$candidate = realpath($outputDirectory) . '/.ptp-build-' . bin2hex(random_bytes(12)) . '.php';
$compileConfig['output'] = $candidate;

file_put_contents($tempConfigPath, json_encode($compileConfig, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
chmod($tempConfigPath, 0600);

// Run box compile
$command = 'box compile --config=' . escapeshellarg($tempConfigPath);

printf('Running box compile..' . PHP_EOL);
printf('> %s' . PHP_EOL, $command);
exec($command, $compilerOutput, $compilerStatus);

// Remove temporary config
printf('Deleting temporary config..' . PHP_EOL);
unlink($tempConfigPath);

if ($compilerStatus !== 0 || !is_file($candidate) || filesize($candidate) === 0) {
    if (is_file($candidate)) {
        unlink($candidate);
    }

    fwrite(STDERR, "Compilation failed; existing artifact was not replaced.\n");
    exit($compilerStatus !== 0 ? $compilerStatus : 1);
}

exec(escapeshellarg(PHP_BINARY) . ' -l ' . escapeshellarg($candidate), $lintOutput, $lintStatus);

if ($lintStatus !== 0) {
    unlink($candidate);
    exit(1);
}

if (!rename($candidate, $outputDirectory . '/ptp-server.php')) {
    unlink($candidate);
    exit(1);
}

if ($generatedPassword) {
    $credentialPath = $tempDirectory . '/.ptp-credentials.json';

    if (file_put_contents($credentialPath, json_encode(['username' => $username, 'password' => $password], JSON_THROW_ON_ERROR)) === false) {
        exit(1);
    }

    chmod($credentialPath, 0600);
    printf('Generated credentials saved to %s (keep private).\n', $credentialPath);
}

printf("Compiled dist/ptp-server.php successfully.\n");
