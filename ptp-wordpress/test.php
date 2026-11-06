<?php

// Isolated adapter tests; deliberately no dependency on a user's WordPress install.
if (PHP_SAPI !== 'cli') {
    exit;
}

$fixtureRoot = getenv('PTP_WORDPRESS_FIXTURE_ROOT');

if (!in_array($argv[2] ?? '', ['--preview', '--browse-preview', '--save-preview'], true)) {
    $fixtureRoot = false;
}

define('ABSPATH', $fixtureRoot ?: __DIR__);
define('WP_CONTENT_DIR', ABSPATH . '/wp-content');
define('WP_PLUGIN_DIR', WP_CONTENT_DIR . '/plugins');
$hooks = [];
$filters = [];
$enabled = false;
$ssl = true;
$allowed = true;
$userId = 1;
$validNonce = true;
$capabilities = [];
$fileModAllowed = true;
$options = [];
$jsonResponse = null;
$root = $fixtureRoot ?: sys_get_temp_dir() . '/ptp-wordpress-' . bin2hex(random_bytes(8));
function add_action($name, $callback) {
    $GLOBALS['hooks'][$name] = $callback;
}
function add_filter($name, $callback, $priority = 10, $acceptedArgs = 1) {
    $GLOBALS['filters'][$name][] = ['callback' => $callback, 'priority' => $priority];
}
function register_deactivation_hook(...$args) {
}
function is_ssl() {
    return $GLOBALS['ssl'];
}
function get_current_user_id() {
    return $GLOBALS['userId'];
}
function current_user_can($cap) {
    return $GLOBALS['allowed'] && ($GLOBALS['capabilities'][$cap] ?? true);
}
function wp_is_file_mod_allowed($context) {
    return $GLOBALS['allowed'] && $GLOBALS['fileModAllowed'];
}
function get_option($name, $default = false) {
    if ($name === 'ptp_enabled') {
        return $GLOBALS['enabled'];
    }

    return $GLOBALS['options'][$name] ?? $default;
}
function update_option($name, $value, $autoload = null) {
    if ($name === 'ptp_enabled') {
        $GLOBALS['enabled'] = $value;
    } else {
        $GLOBALS['options'][$name] = $value;
    }
}
function get_stylesheet_directory() {
    return $GLOBALS['root'];
}
function check_admin_referer($action) {
    if (!in_array($action, ['ptp_download_config', 'ptp_folder_access', 'ptp_settings'], true) || !$GLOBALS['validNonce']) {
        throw new RuntimeException('Invalid download nonce');
    }
}
function wp_die($message, $title = '', $args = []) {
    throw new RuntimeException($message, $args['response'] ?? 500);
}
function wp_get_current_user() {
    return (object)['user_login' => 'admin: # "quoted" user'];
}
function rest_url($path) {
    return 'https://example.com/?rest_route=/' . $path;
}
function nocache_headers() {
}
function esc_html($value) {
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}
function esc_url($value) {
    return esc_html($value);
}
function esc_attr($value) {
    return esc_html($value);
}
function wp_unslash($value) {
    return $value;
}
function wp_json_encode($value, $flags = 0) {
    return json_encode($value, $flags);
}
function wp_create_nonce($action) {
    return 'fixture-nonce';
}
function check_ajax_referer($action, $parameter) {
    check_admin_referer($action);
}
function wp_send_json_success($data) {
    $GLOBALS['jsonResponse'] = ['success' => true, 'data' => $data, 'status' => 200];
}
function wp_send_json_error($data, $status) {
    $GLOBALS['jsonResponse'] = ['success' => false, 'data' => $data, 'status' => $status];
}
function wp_send_json($data, $status) {
    $GLOBALS['jsonResponse'] = ['data' => $data, 'status' => $status];
}
function wp_upload_dir() {
    return ['basedir' => WP_CONTENT_DIR . '/uploads'];
}
function get_theme_root() {
    return WP_CONTENT_DIR . '/themes';
}
function selected($value, $expected, $echo) {
    if ($value === $expected) {
        return 'selected';
    }

    return '';
}
function admin_url($path) {
    if ($GLOBALS['fixtureRoot']) {
        return '/' . $path;
    }

    return 'https://example.com/wp-admin/' . $path;
}
function wp_nonce_field($action) {
    echo '<input name="_wpnonce" value="' . esc_html($action) . '">';
}
function checked($value, $expected, $echo) {
    if ($value === $expected) {
        return 'checked';
    }

    return '';
}
function submit_button($label, $type, $name) {
    echo '<button name="' . esc_html($name) . '">' . esc_html($label) . '</button>';
}
class WP_Error {
    public function __construct(public $code, public $message, public $data) {
    }
}
class WP_REST_Response {
    public function __construct(public $data, public $status, public $headers = []) {
    }
    public function get_status() {
        return $this->status;
    }
    public function header($name, $value) {
        $this->headers[$name] = $value;
    }
}
class Request {
    public function __construct(private $query, private $method = 'GET', private $body = '', private $route = '/ptp/v1/files', private $headers = []) {
    }
    public function get_query_params() {
        return $this->query;
    }
    public function get_method() {
        return $this->method;
    }
    public function get_route() {
        return $this->route;
    }
    public function get_body() {
        return $this->body;
    }
    public function get_header($name) {
        return $this->headers[strtolower($name)] ?? null;
    }
}

require ($argv[1] ?? __DIR__) . '/plugin.php';
$plugin = new PTP_WordPress();

if (in_array($argv[2] ?? '', ['--preview', '--browse-preview', '--save-preview'], true)) {
    $input = json_decode(file_get_contents('php://stdin'), true);
    $enabled = true;
    $options = $input['options'] ?? [];
    $_POST = $input['post'] ?? [];

    if ($argv[2] === '--browse-preview') {
        $hooks['wp_ajax_ptp_browse_folders']();
        echo json_encode($jsonResponse);
        exit;
    }

    if ($argv[2] === '--save-preview') {
        ob_start();
        $plugin->settings();
        ob_end_clean();
        echo json_encode($options);
        exit;
    }

    echo '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>PTP folder access preview</title><link rel="stylesheet" href="/assets/folder-access.css"><style>body{margin:24px;background:#f0f0f1;color:#1d2327;font:14px/1.5 system-ui,sans-serif}h1{font-size:24px}h2{font-size:20px;margin-top:24px}button,input,select{font:inherit}input[type=text],select{padding:5px 8px;border:1px solid #8c8f94;border-radius:3px;background:#fff;max-width:100%}input[type=checkbox]{accent-color:#2271b1}button,.button{background:#fff;color:#2271b1;border:1px solid #2271b1;border-radius:3px;padding:4px 12px;cursor:pointer}.button-primary{background:#2271b1;color:#fff}button:disabled{opacity:.6;cursor:default}.widefat{width:100%;max-width:960px;text-align:left;background:#fff;border-collapse:collapse}.widefat th,.widefat td{padding:8px}.striped tr:nth-child(odd){background:#f6f7f7}.ul-disc{list-style:disc;margin-left:24px}code{overflow-wrap:anywhere}.wrap>p{max-width:75ch}</style></head><body>';
    $plugin->settings();
    echo '<script src="/assets/folder-access.js"></script></body></html>';
    exit;
}

if (($argv[2] ?? '') === '--download') {
    $hooks['admin_post_ptp_download_config']();
}

if (in_array($argv[2] ?? '', ['--disallow-file-edit', '--disallow-file-mods'], true)) {
    $constant = 'DISALLOW_FILE_EDIT';
    $expectedCode = 'ptp_file_edit_disabled';

    if ($argv[2] === '--disallow-file-mods') {
        $constant = 'DISALLOW_FILE_MODS';
        $expectedCode = 'ptp_file_mods_disabled';
    }

    define($constant, true);
    $enabled = true;
    $hooks['application_password_did_authenticate']((object)['ID' => 1]);
    $error = $plugin->permission();
    ob_start();
    $plugin->settings();
    $settings = ob_get_clean();

    if (!($error instanceof WP_Error) || $error->code !== $expectedCode || !str_contains($settings, $constant)) {
        throw new RuntimeException('Policy reason missing from API or settings: ' . $constant);
    }

    echo 'Passed API and settings checks for ' . $constant . PHP_EOL;
    exit;
}

mkdir($root);
$count = 0;
function check($condition, $message) {
    if (!$condition) {
        throw new RuntimeException($message);
    } $GLOBALS['count']++;
}
function callApi($action, $params = [], $method = 'GET', $body = '') {
    return $GLOBALS['plugin']->dispatch(new Request(['action' => $action] + $params, $method, $body));
}

function encryptedCallApi($action, $params = [], $method = 'GET', $body = '', $tamper = false) {
    $password = 'fixture application password with spaces';
    $metadata = json_encode(['method' => $method, 'parameters' => ['action' => $action] + $params], JSON_THROW_ON_ERROR);
    $nonce = random_bytes(12);
    $context = 'PTP encrypted request v1';
    $key = hash_hkdf('sha256', $password, 32, $context, $nonce);
    $tag = '';
    $data = openssl_encrypt(pack('N', strlen($metadata)) . $metadata . $body, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag, $context);
    $envelope = json_encode(['version' => 1, 'nonce' => base64_encode($nonce), 'tag' => base64_encode($tamper ? str_repeat("\0", 16) : $tag), 'data' => base64_encode($data)], JSON_THROW_ON_ERROR);

    return $GLOBALS['plugin']->dispatch(new Request([], 'POST', $envelope, '/ptp/v1/files', [
        'x-ptp-transport' => 'encrypted-v1',
        'authorization' => 'Basic ' . base64_encode('admin:' . $password),
    ]));
}

function streamFixture(string $source): array {
    $output = tmpfile();
    $process = proc_open([PHP_BINARY, '-d', 'xdebug.mode=off', '-d', 'memory_limit=16M', __DIR__ . '/test-stream.php', $GLOBALS['argv'][1] ?? __DIR__, $source], [
        0 => ['pipe', 'r'],
        1 => $output,
        2 => ['pipe', 'w'],
    ], $pipes);

    if (!is_resource($process)) {
        throw new RuntimeException('Cannot start stream regression process');
    }

    fclose($pipes[0]);
    $diagnostics = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    $exit = proc_close($process);
    $size = fstat($output)['size'];
    rewind($output);
    $hash = hash_init('sha256');
    hash_update_stream($hash, $output);
    rewind($output);
    $body = null;

    if ($size < 1024 * 1024) {
        $body = stream_get_contents($output);
    }

    fclose($output);

    return ['exit' => $exit, 'size' => $size, 'sha256' => hash_final($hash), 'body' => $body, 'diagnostics' => json_decode($diagnostics, true, 512, JSON_THROW_ON_ERROR)];
}

try {
    check(isset($hooks['admin_post_ptp_download_config']), 'Download action registered');
    check(!isset($hooks['admin_post_nopriv_ptp_download_config']), 'No public download action');
    $allowed = false;

    try {
        $plugin->downloadConfig();
        check(false, 'Download must deny non-administrators');
    } catch (RuntimeException $error) {
        check($error->getCode() === 403, 'Download capability denied');
    }

    $allowed = true;
    $validNonce = false;

    try {
        $plugin->downloadConfig();
        check(false, 'Download must require a nonce');
    } catch (RuntimeException $error) {
        check($error->getMessage() === 'Invalid download nonce', 'Download nonce denied');
    }

    $validNonce = true;
    $process = proc_open([PHP_BINARY, '-d', 'xdebug.mode=off', __FILE__, $argv[1] ?? __DIR__, '--download'], [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ], $pipes);
    check(is_resource($process), 'Download process started');
    fclose($pipes[0]);
    $yaml = stream_get_contents($pipes[1]);
    $errors = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    check(proc_close($process) === 0 && $errors === '', 'Download completed');
    check(str_contains($yaml, 'apiEndPoint: "https://example.com/?rest_route=/ptp/v1/files"'), 'Download preserves query endpoint');
    check(str_contains($yaml, 'apiUsername: ' . json_encode(wp_get_current_user()->user_login)), 'Download escapes username');
    check(str_contains($yaml, 'REPLACE_WITH_APPLICATION_PASSWORD'), 'Download uses password placeholder');
    check(str_contains($yaml, 'host: 127.0.0.1') && str_contains($yaml, 'passiveUrl: 127.0.0.1') && str_contains($yaml, 'port: 8021'), 'Download includes local bridge settings');
    check(str_contains($yaml, 'printCommands: false') && !str_contains($yaml, 'extends:'), 'Download is self-contained');

    check($plugin->permission() instanceof WP_Error, 'Cookie-only access denied');
    $hooks['application_password_did_authenticate']((object)['ID' => 1]);
    check($plugin->permission()->data['status'] === 403, 'Disabled by default');
    check($plugin->permission()->code === 'ptp_disabled', 'Disabled reason is specific');
    $enabled = true;
    check($plugin->permission() === true, 'App password accepted');
    $capabilities['manage_options'] = false;
    check($plugin->permission()->code === 'ptp_manage_options', 'Administrator permission reason');
    $capabilities = ['edit_themes' => false];
    check($plugin->permission()->code === 'ptp_edit_themes', 'Theme editing permission reason');
    $capabilities = [];
    $fileModAllowed = false;
    check($plugin->permission()->code === 'ptp_file_mods', 'File modification policy reason');
    $enabled = false;
    $capabilities['edit_themes'] = false;
    $blockers = $plugin->permission()->data['blockers'];
    check(isset($blockers['ptp_disabled'], $blockers['ptp_edit_themes'], $blockers['ptp_file_mods']), 'API reports all access blockers');
    ob_start();
    $plugin->settings();
    $settings = ob_get_clean();
    check(str_contains($settings, 'PTP access is blocked:'), 'Settings show blocked access');

    foreach ($blockers as $message) {
        check(str_contains($settings, esc_html($message)), 'Settings show each API blocker');
    }

    $enabled = true;
    $capabilities = [];
    $fileModAllowed = true;
    ob_start();
    $plugin->settings();
    $settings = ob_get_clean();
    check(str_contains($settings, 'WordPress access checks passed for your account.'), 'Settings show passing checks');
    $ssl = false;
    check($plugin->permission()->code === 'ptp_https', 'HTTPS detection reason');
    $ssl = true;
    $allowed = false;
    check($plugin->permission() instanceof WP_Error, 'Insufficient capability denied');
    $allowed = true;
    $userId = 2;
    check($plugin->permission() instanceof WP_Error, 'Different current user denied');
    $userId = 1;
    $methodError = callApi('write');
    check($methodError->get_status() === 405 && $methodError->headers['Allow'] === 'POST', 'GET cannot write and reports allowed method');
    $methodError->header('Allow', 'GET, POST, DELETE');
    $headerFilter = $filters['rest_post_dispatch'][0];
    check($headerFilter['priority'] > 10, 'Action header filter runs after the WordPress core Allow filter');
    $headerFilter['callback']($methodError, null, new Request(['action' => 'write']));
    check($methodError->headers['Allow'] === 'POST', 'Action method survives the core route-wide Allow replacement');
    $methodError->header('Allow', 'GET, POST, DELETE');
    $headerFilter['callback']($methodError, null, new Request(['action' => 'write'], 'GET', '', '/another-plugin/files'));
    check($methodError->headers['Allow'] === 'GET, POST, DELETE', 'Action header filter leaves unrelated REST routes alone');
    check(callApi('unknown')->data['status'] === 404, 'Unknown action');
    check(callApi('write', [], 'POST')->data['status'] === 400, 'Write requires explicit path');
    check(callApi([], [], 'GET')->data['status'] === 400, 'Action must be scalar');
    check(callApi('read', ['path' => []])->data['status'] === 400, 'Array path');
    check(callApi('read', ['start' => '-1'])->data['status'] === 400, 'Negative offset');
    check(callApi('read', ['start' => str_repeat('9', 40)])->data['status'] === 400, 'Overflow offset');
    check(callApi('get', ['path' => '../outside']) instanceof WP_Error, 'Traversal denied');
    check(callApi('write', ['path' => 'binary', 'append' => 'maybe'], 'POST') instanceof WP_Error, 'Invalid append');
    $binary = "\0\xff\r\n0";
    check(callApi('write', ['path' => 'binary'], 'POST', $binary)->data['success'], 'Write');
    check(callApi('get', ['path' => 'binary'])->data['file']['size'] === strlen($binary), 'Stat');
    check(count(callApi('list')->data['list']) === 1, 'List');
    $response = callApi('read', ['path' => 'binary']);
    $server = new class () {
        public function send_header(...$args) {
        }
    };
    check($response->headers['Content-Length'] === (string)strlen($binary), 'Read declares exact byte length');
    $plugin->serve(true, $response, null, $server);
    $streamResult = streamFixture($root . '/binary');
    check($streamResult['exit'] === 0 && $streamResult['body'] === $binary, 'Raw binary response');
    check($streamResult['diagnostics']['buffers'] === 0, 'Download clears pre-existing output buffers');
    check($streamResult['diagnostics']['headers']['Content-Length'] === (string)strlen($binary), 'Served download has exact content length');
    check(callApi('write', ['path' => 'binary', 'append' => 'true'], 'POST', 'end')->data['success'], 'Append');
    check(file_get_contents($root . '/binary') === $binary . 'end', 'Append contents');
    check(callApi('write', ['path' => 'binary', 'start' => '1'], 'POST', 'X')->data['success'], 'Resume');
    check(file_get_contents($root . '/binary')[1] === 'X', 'Resume contents');
    check(callApi('rename', ['from' => 'binary', 'to' => 'renamed'], 'POST')->data['success'], 'Rename');
    check(callApi('delete', ['path' => 'renamed'], 'DELETE')->data['success'], 'Delete');
    check(callApi('mkdir', ['path' => 'folder'], 'POST')->data['success'], 'Mkdir');
    check(callApi('rmdir', ['path' => 'folder'], 'DELETE')->data['success'], 'Rmdir');
    check(callApi('write', ['path' => 'empty'], 'POST')->data['file']['size'] === 0, 'Empty upload');
    check(callApi('delete', ['path' => 'empty'], 'DELETE')->data['success'], 'Delete empty');
    check(encryptedCallApi('write', ['path' => '/wp-config.php'], 'POST', $binary)->data['success'], 'Encrypted POST writes binary with sensitive filename');
    check(file_get_contents($root . '/wp-config.php') === $binary, 'Encrypted write preserves exact bytes');
    check(encryptedCallApi('get', ['path' => '/wp-config.php'])->data['file']['size'] === strlen($binary), 'Encrypted stat');
    check(encryptedCallApi('list')->data['success'], 'Encrypted list uses semantic read permissions');
    $encryptedRead = encryptedCallApi('read', ['path' => '/wp-config.php']);
    check($encryptedRead->headers['Content-Length'] === (string)strlen($binary), 'Encrypted read still streams exact content length');
    $plugin->serve(true, $encryptedRead, null, $server);
    check(encryptedCallApi('delete', ['path' => '/wp-config.php'], 'DELETE')->data['success'], 'Encrypted delete');
    check(encryptedCallApi('list', [], 'GET', '', true)->code === 'ptp_transport_invalid', 'Encrypted request rejects modified authentication tag');
    check(encryptedCallApi('delete', ['path' => '/missing'], 'GET')->get_status() === 405, 'Encrypted request cannot disguise a write as a read');
    $encryptedUpload = encryptedCallApi('uploadBegin', ['path' => '/.htaccess'], 'POST')->data['upload'];
    check($encryptedUpload['maxChunkSize'] === 524288, 'Encrypted session advertises its decoded chunk limit');
    check(encryptedCallApi('uploadWrite', ['uploadId' => $encryptedUpload['id'], 'offset' => '0'], 'POST', $binary)->data['success'], 'Encrypted upload chunk');
    check(encryptedCallApi('uploadCommit', ['uploadId' => $encryptedUpload['id'], 'size' => (string)strlen($binary), 'sha256' => hash('sha256', $binary)], 'POST')->data['success'], 'Encrypted commit');
    check(file_get_contents($root . '/.htaccess') === $binary, 'Encrypted commit preserves verified bytes');
    check(encryptedCallApi('delete', ['path' => '/.htaccess'], 'DELETE')->data['success'], 'Encrypted fixture removed');
    $response = callApi('hello');
    $plugin->serve(true, $response, null, $server);
    check(streamFixture('hello')['body'] === 'hi', 'Hello wire format');

    foreach (['failure', 'truncated'] as $source) {
        $streamResult = streamFixture($source);
        check($streamResult['exit'] !== 0 && isset($streamResult['diagnostics']['error']), 'Broken download fails loudly: ' . $source);
        check($streamResult['diagnostics']['streamClosed'], 'Broken download closes handle: ' . $source);
    }

    $large = fopen($root . '/large.bin', 'wb');
    $block = str_repeat('x', 65536);

    for ($index = 0; $index < 384; $index++) {
        fwrite($large, $block);
    }

    fclose($large);
    $streamResult = streamFixture($root . '/large.bin');
    check($streamResult['exit'] === 0 && $streamResult['size'] === 24 * 1024 * 1024, 'Download exceeds child memory limit without buffering');
    check($streamResult['sha256'] === hash_file('sha256', $root . '/large.bin'), 'Large download retains exact bytes');
    unlink($root . '/large.bin');

    $oversize = str_repeat('x', 4194305);
    check(callApi('write', ['path' => 'too-large'], 'POST', $oversize)->data['status'] === 413, 'Oversized upload rejected');
    unset($oversize);
    check(!file_exists($root . '/too-large'), 'Oversized upload creates no file');

    $_SERVER['CONTENT_LENGTH'] = '4194305';
    check(callApi('write', ['path' => 'declared-large'], 'POST', 'small')->data['status'] === 413, 'Oversized declared body rejected');
    $plugin->validateRequestLength((object)['query_vars' => ['rest_route' => '/ptp/v1/files']]);
    check($jsonResponse['status'] === 413 && $jsonResponse['data']['code'] === 'ptp_payload_too_large', 'Declared body limit runs before WordPress reads the REST body');
    unset($_SERVER['CONTENT_LENGTH']);
    check(!file_exists($root . '/declared-large'), 'Oversized declared body creates no file');
    $options['ptp_permissions'] = 'read';
    check(callApi('list')->data['success'], 'Read-only listing allowed');
    check(encryptedCallApi('list')->data['success'], 'Read-only permits encrypted POST listing');
    check(encryptedCallApi('write', ['path' => '/readonly.txt'], 'POST', 'blocked')->code === 'ptp_read_only', 'Encrypted POST preserves read-only restrictions');

    foreach ([
        ['write', ['path' => 'readonly.txt'], 'POST'],
        ['uploadBegin', ['path' => 'readonly.txt'], 'POST'],
        ['uploadWrite', ['uploadId' => str_repeat('a', 64), 'offset' => '0'], 'POST'],
        ['uploadCommit', ['uploadId' => str_repeat('a', 64), 'size' => '0', 'sha256' => hash('sha256', '')], 'POST'],
        ['uploadAbort', ['uploadId' => str_repeat('a', 64)], 'POST'],
        ['mkdir', ['path' => 'readonly'], 'POST'],
        ['rename', ['from' => 'one', 'to' => 'two'], 'POST'],
        ['chmod', ['path' => 'one', 'mode' => '644'], 'POST'],
        ['delete', ['path' => 'one'], 'DELETE'],
        ['rmdir', ['path' => 'one'], 'DELETE'],
    ] as [$action, $parameters, $method]) {
        check(callApi($action, $parameters, $method)->code === 'ptp_read_only', 'Read-only denies ' . $action);
    }

    check(!file_exists($root . '/readonly.txt') && !is_dir($root . '/readonly'), 'Read-only creates nothing');
    $options['ptp_permissions'] = 'read_write';
    file_put_contents($root . '/atomic.txt', 'ORIGINAL');
    $begin = callApi('uploadBegin', ['path' => '/atomic.txt'], 'POST');
    $upload = $begin->data['upload'];
    check(preg_match('/^[a-f0-9]{64}$/D', $upload['id']) === 1 && $upload['offset'] === 0, 'Atomic upload begins with an opaque ID and zero offset');
    check($upload['maxChunkSize'] === 4194304, 'Atomic upload reports its chunk limit');
    $uploadId = $upload['id'];
    $written = callApi('uploadWrite', ['uploadId' => $uploadId, 'offset' => '0'], 'POST', 'NEW');
    check($written->data['upload']['offset'] === 3, 'Atomic upload advances accepted offset');
    check(file_get_contents($root . '/atomic.txt') === 'ORIGINAL', 'Atomic upload leaves original visible while staging');
    $mismatch = callApi('uploadCommit', ['uploadId' => $uploadId, 'size' => '3', 'sha256' => hash('sha256', 'bad')], 'POST');
    check($mismatch->data['status'] === 409, 'Checksum mismatch rejects commit');
    check(file_get_contents($root . '/atomic.txt') === 'ORIGINAL', 'Rejected commit preserves original');
    check(callApi('uploadAbort', ['uploadId' => $uploadId], 'POST')->data['success'], 'Atomic upload can be aborted');

    $uploadId = callApi('uploadBegin', ['path' => '/atomic.txt'], 'POST')->data['upload']['id'];
    callApi('uploadWrite', ['uploadId' => $uploadId, 'offset' => '0'], 'POST', 'NEW');
    callApi('uploadWrite', ['uploadId' => $uploadId, 'offset' => '3'], 'POST', ' VALUE');
    $committed = callApi('uploadCommit', ['uploadId' => $uploadId, 'size' => '9', 'sha256' => hash('sha256', 'NEW VALUE')], 'POST');
    check($committed->data['success'] && $committed->data['sha256'] === hash('sha256', 'NEW VALUE'), 'Atomic upload commits verified payload');
    check(file_get_contents($root . '/atomic.txt') === 'NEW VALUE', 'Atomic upload publishes complete contents');
    unlink($root . '/atomic.txt');

    mkdir($root . '/plugins/private/allowed', 0755, true);
    mkdir($root . '/plugins/public', 0755, true);
    mkdir($root . '/uploads');
    file_put_contents($root . '/plugins/private/secret.txt', 'secret');
    file_put_contents($root . '/plugins/public/plugin.php', 'plugin');
    file_put_contents($root . '/index.php', 'root file');
    $options['ptp_access'] = ['root' => $root, 'rules' => ['/' => false, '/plugins' => true, '/plugins/private' => false]];
    $list = callApi('list')->data['list'];
    check(count($list) === 1 && $list[0]['name'] === 'plugins', 'Root only lists accessible branches');
    $pageOffset = 0;
    $pageNames = [];

    do {
        $page = callApi('listPage', ['path' => '/', 'offset' => (string)$pageOffset, 'limit' => '1']);
        check($page->data['success'] && count($page->data['entries']) <= 1, 'Directory page has a bounded entries shape');
        $pageNames = array_merge($pageNames, array_column($page->data['entries'], 'name'));
        $pageOffset = $page->data['nextOffset'];
    } while ($pageOffset !== null);

    check($pageNames === ['plugins'], 'Directory pages filter excluded paths and preserve navigable ancestors');
    check(callApi('get', ['path' => '/'])->data['file']['isDirectory'], 'Root remains navigable');
    check(callApi('get', ['path' => '/plugins/public/plugin.php'])->data['success'], 'Selected plugin accessible');
    check(callApi('write', ['path' => '/plugins/public/new.txt'], 'POST', 'new')->data['success'], 'Selected folder writable');

    foreach ([
        ['get', ['path' => '/plugins/private/secret.txt'], 'GET'],
        ['read', ['path' => '/plugins/private/secret.txt'], 'GET'],
        ['list', ['path' => '/uploads'], 'GET'],
        ['write', ['path' => '/plugins/private/new.txt'], 'POST'],
        ['uploadBegin', ['path' => '/plugins/private/new.txt'], 'POST'],
        ['mkdir', ['path' => '/plugins/private/new'], 'POST'],
        ['delete', ['path' => '/plugins/private/secret.txt'], 'DELETE'],
        ['chmod', ['path' => '/plugins/private/secret.txt', 'mode' => '644'], 'POST'],
        ['rename', ['from' => '/plugins', 'to' => '/plugins-renamed'], 'POST'],
        ['rename', ['from' => '/plugins/public/plugin.php', 'to' => '/plugins/private/plugin.php'], 'POST'],
        ['rename', ['from' => '/plugins/private/secret.txt', 'to' => '/plugins/public/secret.txt'], 'POST'],
        ['chmod', ['path' => '/plugins', 'mode' => '755'], 'POST'],
        ['rmdir', ['path' => '/plugins'], 'DELETE'],
        ['read', ['path' => '/index.php'], 'GET'],
    ] as [$action, $parameters, $method]) {
        check(callApi($action, $parameters, $method)->code === 'ptp_folder_denied', 'Excluded path denied for ' . $action);
        check(encryptedCallApi($action, $parameters, $method)->code === 'ptp_folder_denied', 'Encrypted request preserves excluded path denial for ' . $action);
    }

    check(file_get_contents($root . '/plugins/private/secret.txt') === 'secret', 'Excluded file unchanged');
    $options['ptp_access']['rules']['/plugins/public/plugin.php'] = false;
    check(callApi('read', ['path' => '/plugins/public/plugin.php'])->code === 'ptp_folder_denied', 'Individual file exclusion denies downloads');
    check(callApi('write', ['path' => '/plugins/public/plugin.php'], 'POST', 'blocked')->code === 'ptp_folder_denied', 'Individual file exclusion denies writes');
    $publicFiles = callApi('list', ['path' => '/plugins/public'])->data['list'];
    check(count($publicFiles) === 1 && $publicFiles[0]['name'] === 'new.txt', 'Excluded file hidden from FTP listing');
    unset($options['ptp_access']['rules']['/plugins/public/plugin.php']);
    $options['ptp_access']['rules']['/plugins/private/allowed'] = true;
    $list = callApi('list', ['path' => '/plugins/private'])->data['list'];
    check(count($list) === 1 && $list[0]['name'] === 'allowed', 'Excluded ancestor only exposes selected child');
    check(callApi('write', ['path' => '/plugins/private/allowed/new.txt'], 'POST', 'allowed')->data['success'], 'Selected descendant writable');
    $options['ptp_access']['rules']['/unselected-parent/selected-child'] = true;
    check(callApi('write', ['path' => '/unselected-parent/selected-child/new.txt'], 'POST', 'blocked')->code === 'ptp_folder_denied', 'Write cannot create excluded parent');
    check(!is_dir($root . '/unselected-parent'), 'Excluded parent remains absent');
    unset($options['ptp_access']['rules']['/unselected-parent/selected-child']);
    $options['ptp_access']['rules'] = ['/' => false];
    check($plugin->permission()->code === 'ptp_no_folders', 'Empty selection explained');
    $options['ptp_access']['rules'] = ['/' => true];
    check(callApi('get', ['path' => '/index.php'])->data['success'], 'Selecting root includes files');
    $options['ptp_access']['rules'] = ['/' => false, '/plugins/public/plugin.php' => true];
    $publicFiles = callApi('list', ['path' => '/plugins/public'])->data['list'];
    check(count($publicFiles) === 1 && $publicFiles[0]['name'] === 'plugin.php', 'Individual file selection allows navigation and hides siblings');
    $options['ptp_access']['rules'] = ['/' => true];
    $admin = new PTP_FolderAccessAdmin();
    $_POST = ['root' => $root, 'path' => '/', 'offset' => '0'];
    $admin->browse();
    check($jsonResponse['success'] && count($jsonResponse['data']['entries']) === 3, 'Admin browser shows full directory');
    mkdir($root . '/paged');

    for ($index = 0; $index < 205; $index++) {
        file_put_contents($root . '/paged/file-' . $index, '');
    }

    $_POST = ['root' => $root, 'path' => '/paged', 'offset' => '0'];
    $browserNames = [];
    $browserPages = 0;

    do {
        $admin->browse();
        $browserPage = $jsonResponse['data'];
        check($jsonResponse['success'] && count($browserPage['entries']) <= 100, 'Admin browser limits entry work to one page');
        $browserNames = array_merge($browserNames, array_column($browserPage['entries'], 'name'));
        $nextOffset = $browserPage['nextOffset'];
        $_POST['offset'] = (string)$nextOffset;
        $browserPages++;
    } while ($nextOffset !== null);

    check($browserPages === 3 && count(array_unique($browserNames)) === 205, 'Admin browser visits each entry once across pages');
    $_POST['path'] = '../';
    $admin->browse();
    check($jsonResponse['status'] === 400, 'Admin browse rejects traversal');
    $allowed = false;
    $admin->browse();
    check($jsonResponse['status'] === 403, 'Admin browse requires administrator');
    $allowed = true;
    $validNonce = false;

    try {
        $admin->browse();
        check(false, 'Admin browse must require nonce');
    } catch (RuntimeException $error) {
        check($error->getMessage() === 'Invalid download nonce', 'Admin browse nonce denied');
    }

    $validNonce = true;
    $_POST = ['ptp_save_access' => '1', 'ptp_root' => $root, 'ptp_access_rules' => '{"/":false,"/plugins":true}'];
    $allowed = false;
    check(str_starts_with($admin->save(), 'Folder access was not saved:'), 'Folder save requires administrator');
    $allowed = true;
    check($admin->save() === 'Folder access saved.', 'Folder selection saves');
    check($options['ptp_access']['rules']['/plugins'] === true, 'Saved folder selection persisted');
    $saved = $options['ptp_access'];
    $_POST['ptp_root'] = $root . '/missing';
    check(str_starts_with($admin->save(), 'Folder access was not saved:'), 'Invalid root rejected');
    check($options['ptp_access'] === $saved, 'Invalid save retains previous selection');
    $_POST['ptp_root'] = $root;
    $_POST['ptp_access_rules'] = '{"/../outside":true}';
    check(str_starts_with($admin->save(), 'Folder access was not saved:'), 'Traversal rule rejected');
    check($options['ptp_access'] === $saved, 'Traversal save retains previous selection');
    $_POST['ptp_access_rules'] = '{"/":true}';
    $validNonce = false;

    try {
        $admin->save();
        check(false, 'Folder save must require nonce');
    } catch (RuntimeException $error) {
        check($options['ptp_access'] === $saved, 'Invalid nonce retains folder settings');
    }

    $validNonce = true;
    $_POST = ['ptp_save' => '1', 'ptp_enabled' => '1', 'ptp_permissions' => 'read'];
    ob_start();
    $plugin->settings();
    $settings = ob_get_clean();
    check($options['ptp_permissions'] === 'read' && str_contains($settings, 'Read only'), 'Permission setting saves and renders');
    $_POST = [];
    echo "Passed $count adapter checks.\n";
} finally {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);

    foreach ($files as $file) {
        if ($file->isDir() && !$file->isLink()) {
            rmdir($file->getPathname());
        } else {
            unlink($file->getPathname());
        }
    }

    rmdir($root);
}
