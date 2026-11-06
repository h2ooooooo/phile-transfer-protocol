<?php

defined('ABSPATH') || exit;

use jalsoedesign\PhileTransferProtocol\Api\Http\FileApi;
use jalsoedesign\PhileTransferProtocol\Api\Http\HttpError;
use jalsoedesign\PhileTransferProtocol\Api\Http\Request\RequestParameterBag;
use jalsoedesign\PhileTransferProtocol\Api\Http\Request\EncryptedRequest;
use jalsoedesign\PhileTransferProtocol\Api\Http\UploadManager;
use jalsoedesign\PhileTransferProtocol\Exception\HttpException;

require_once __DIR__ . '/FolderAccessAdmin.php';
$sharedAutoload = __DIR__ . '/server/autoload.php';

if (!is_file($sharedAutoload)) {
    $sharedAutoload = dirname(__DIR__) . '/ptp-server/src/autoload.php';
}

require_once $sharedAutoload;

final class PTP_WordPress {
    private const ACTION_METHODS = [
        'hello' => 'GET',
        'get' => 'GET',
        'list' => 'GET',
        'listPage' => 'GET',
        'read' => 'GET',
        'getUniqueName' => 'GET',
        'write' => 'POST',
        'uploadBegin' => 'POST',
        'uploadWrite' => 'POST',
        'uploadCommit' => 'POST',
        'uploadAbort' => 'POST',
        'mkdir' => 'POST',
        'rename' => 'POST',
        'chmod' => 'POST',
        'delete' => 'DELETE',
        'rmdir' => 'DELETE',
    ];

    private int $authenticatedUser = 0;
    private array $streams = [];
    private PTP_FolderAccessAdmin $folders;

    public function __construct() {
        $this->folders = new PTP_FolderAccessAdmin();
        add_action('application_password_did_authenticate', function ($user) {
            $this->authenticatedUser = (int) $user->ID;
        });

        add_action('rest_api_init', function () {
            register_rest_route('ptp/v1', '/files', [
                'methods' => 'GET,POST,DELETE',
                'permission_callback' => [$this, 'permission'],
                'callback' => [$this, 'dispatch'],
            ]);
        });

        add_filter('rest_pre_serve_request', [$this, 'serve'], 10, 4);
        add_filter('rest_post_dispatch', [$this, 'responseHeaders'], 100, 3);
        add_action('parse_request', [$this, 'validateRequestLength'], 0);
        add_action('admin_post_ptp_download_config', [$this, 'downloadConfig']);
        add_action('admin_menu', function () {
            add_management_page('PTP', 'PTP', 'manage_options', 'ptp', [$this, 'settings']);
        });

        register_deactivation_hook(__DIR__ . '/ptp-wordpress.php', function () {
            delete_option('ptp_enabled');
        });
    }

    private function canEdit(): bool {
        return current_user_can('manage_options')
            && current_user_can('edit_themes')
            && wp_is_file_mod_allowed('ptp');
    }

    private function accessBlockers(): array {
        $blockers = [];

        if (!is_ssl()) {
            $blockers['ptp_https'] = 'WordPress does not detect HTTPS. Use HTTPS and check the reverse proxy HTTPS configuration.';
        }

        if (!get_option('ptp_enabled', false)) {
            $blockers['ptp_disabled'] = 'PTP access is disabled. Enable PTP access under Tools > PTP and click Save.';
        }

        if (!current_user_can('manage_options')) {
            $blockers['ptp_manage_options'] = 'This WordPress account lacks the manage_options permission. Use an administrator account.';
        }

        if (defined('DISALLOW_FILE_MODS') && DISALLOW_FILE_MODS) {
            $blockers['ptp_file_mods_disabled'] = 'WordPress file modifications are disabled by DISALLOW_FILE_MODS. Ask the site administrator to review this setting.';
        } elseif (!wp_is_file_mod_allowed('ptp')) {
            $blockers['ptp_file_mods'] = 'WordPress blocks file modifications for PTP through the file_mod_allowed filter. Ask the site administrator to review the site security policy.';
        }

        if (defined('DISALLOW_FILE_EDIT') && DISALLOW_FILE_EDIT) {
            $blockers['ptp_file_edit_disabled'] = 'WordPress theme editing is disabled by DISALLOW_FILE_EDIT. Ask the site administrator to review this setting.';
        } elseif (!current_user_can('edit_themes') && !isset($blockers['ptp_file_mods_disabled'])) {
            $blockers['ptp_edit_themes'] = 'This WordPress account lacks the edit_themes permission. Ask the site administrator to allow theme editing for this account.';
        }

        return $blockers + $this->folders->blockers();
    }

    public function permission() {
        if (!is_ssl()) {
            return new WP_Error('ptp_https', 'WordPress does not detect HTTPS. Use HTTPS and check the reverse proxy HTTPS configuration.', ['status' => 403]);
        }

        // Force WordPress to resolve authentication before checking the hook result.

        $userId = get_current_user_id();

        if (!$userId || $userId !== $this->authenticatedUser) {
            return new WP_Error('ptp_auth', 'WordPress did not authenticate this request with an Application Password. Check the YAML credentials and Authorization header forwarding.', ['status' => 401]);
        }

        $blockers = $this->accessBlockers();

        if ($blockers !== []) {
            $code = array_key_first($blockers);

            return new WP_Error($code, $blockers[$code], ['status' => 403, 'blockers' => $blockers]);
        }

        return true;
    }

    private function parameter(array $query, string $name, ?string $default = null): string {
        $value = $query[$name] ?? $default;

        if (!is_string($value) || $value === '') {
            throw new InvalidArgumentException('Invalid parameter: ' . $name, 400);
        }

        return $value;
    }

    public function validateRequestLength($request): void {
        $route = $request->query_vars['rest_route'] ?? '';

        if (!is_string($route) || rtrim($route, '/') !== '/ptp/v1/files') {
            return;
        }

        try {
            $this->checkContentLength();
            // Bound chunked requests before WordPress materializes its REST request body.
            RequestParameterBag::readRawBody();
        } catch (Throwable $error) {
            $mapped = HttpError::fromException($error);
            wp_send_json([
                'code' => $mapped['body']['code'],
                'message' => $mapped['body']['error'],
                'data' => ['status' => $mapped['status']],
            ], $mapped['status']);
        }
    }

    private function checkContentLength(): void {
        $length = $_SERVER['CONTENT_LENGTH'] ?? null;

        if ($length === null) {
            return;
        }

        $bytes = filter_var($length, FILTER_VALIDATE_INT);

        if ($bytes === false || $bytes < 0) {
            throw new InvalidArgumentException('Invalid content length', 400);
        }

        if ($bytes > RequestParameterBag::MAX_BODY_BYTES) {
            throw new HttpException(413, 'Request body exceeds the upload chunk limit', 'ptp_payload_too_large');
        }
    }

    private function requestBody($request): string {
        $this->checkContentLength();
        $body = $request->get_body();

        if (strlen($body) > RequestParameterBag::MAX_BODY_BYTES) {
            throw new HttpException(413, 'Request body exceeds the upload chunk limit', 'ptp_payload_too_large');
        }

        return $body;
    }

    public function dispatch($request) {
        $permission = $this->permission();

        if ($permission !== true) {
            return $permission;
        }

        try {
            $query = $request->get_query_params();
            $method = $request->get_method();
            $body = null;
            $transport = $request->get_header('x-ptp-transport');

            if ($transport !== null && $transport !== '') {
                if ($transport !== EncryptedRequest::TRANSPORT || $method !== 'POST') {
                    throw new HttpException(400, 'Unsupported PTP request transport', 'ptp_transport_invalid');
                }

                $decoded = EncryptedRequest::decode($this->requestBody($request), EncryptedRequest::authorizationPassword((string)$request->get_header('authorization')));
                $query = $decoded['parameters'];
                $method = $decoded['method'];
                $body = $decoded['body'];
            }

            $action = $this->parameter($query, 'action');

            if (!isset(self::ACTION_METHODS[$action])) {
                throw new HttpException(404, 'Unknown action', 'ptp_not_found');
            }

            if ($method !== self::ACTION_METHODS[$action]) {
                throw new HttpException(405, 'Incorrect HTTP method', 'ptp_method_not_allowed', ['Allow' => self::ACTION_METHODS[$action]]);
            }

            if (get_option('ptp_permissions', 'read_write') === 'read' && self::ACTION_METHODS[$action] !== 'GET') {
                return new WP_Error('ptp_read_only', 'PTP permissions are set to Read only. Change Permissions under Tools > PTP to allow file changes.', ['status' => 403]);
            }

            $api = $this->createFileApi($action);
            $pathDefault = null;

            if (in_array($action, ['list', 'listPage', 'hello', 'getUniqueName', 'rename', 'uploadWrite', 'uploadCommit', 'uploadAbort'], true)) {
                $pathDefault = '.';
            }

            $path = $this->parameter($query, 'path', $pathDefault);
            $offset = $this->offset($query);
            $append = $this->append($query);

            if ($action === 'read' || $action === 'hello') {
                return $this->streamResponse($api, $action, $path, $offset);
            }

            $result = match ($action) {
                'get' => ['file' => $api->get($path)],
                'list' => ['list' => $api->list($path)],
                'listPage' => $api->listPage($path, $this->integer($query, 'offset', '0'), $this->integer($query, 'limit', '100')),
                'getUniqueName' => ['uniqueName' => $api->getUniqueName()],
                'write' => ['file' => $api->write($path, $body ?? $this->requestBody($request), $append, $offset)],
                'uploadBegin', 'uploadWrite', 'uploadCommit', 'uploadAbort' => $this->upload($api, $request, $action, $query, $path, $body),
                'mkdir' => ['created' => (bool)$api->mkdir($path)],
                'rmdir' => ['removed' => (bool)$api->rmdir($path)],
                'delete' => ['deleted' => $api->delete($path)],
                'rename' => $this->rename($api, $query),
                'chmod' => ['changed' => $api->chmod($path, $this->parameter($query, 'mode'))],
            };

            if ($action === 'uploadBegin' && $body !== null) {
                $result['upload']['maxChunkSize'] = min($result['upload']['maxChunkSize'], EncryptedRequest::MAX_PAYLOAD_BYTES);
            }

            return new WP_REST_Response(['success' => true] + $result + ['path' => $path], 200, ['Cache-Control' => 'no-store']);
        } catch (Throwable $error) {
            return $this->errorResponse($error);
        }
    }

    private function rename(FileApi $api, array $query): array {
        $from = $this->parameter($query, 'from');
        $to = $this->parameter($query, 'to');
        $api->rename($from, $to);

        return ['from' => $from, 'to' => $to];
    }

    private function createFileApi(string $action): FileApi {
        try {
            $policy = $this->folders->policy();
        } catch (InvalidArgumentException $error) {
            throw new PTP_FolderAccessDenied('The saved FTP root is unavailable. Choose an existing, readable root under Tools > PTP.');
        }

        if (str_starts_with($action, 'upload')) {
            $action = 'write';
        } elseif ($action === 'listPage') {
            $action = 'list';
        }

        return new FileApi($policy->root(), function (string $path) use ($policy, $action): void {
            $policy->assertAccess($path, $action);
        });
    }

    private function offset(array $query): int {
        return $this->integer($query, 'start', '0');
    }

    private function integer(array $query, string $name, ?string $default = null): int {
        $offset = $this->parameter($query, $name, $default);
        $hasValidDigits = preg_match('/^(0|[1-9][0-9]*)$/D', $offset);
        $fitsInteger = filter_var($offset, FILTER_VALIDATE_INT) !== false;

        if (!$hasValidDigits || !$fitsInteger) {
            throw new InvalidArgumentException('Invalid offset', 400);
        }

        return (int) $offset;
    }

    private function upload(FileApi $api, $request, string $action, array $query, string $path, ?string $body = null): array {
        $uploads = new UploadManager($api, 'wordpress:' . get_current_user_id());

        if ($action === 'uploadBegin') {
            return ['upload' => $uploads->begin($path, $this->append($query), $this->offset($query))];
        }

        $id = $this->parameter($query, 'uploadId');

        if ($action === 'uploadWrite') {
            return ['upload' => $uploads->write($id, $this->integer($query, 'offset'), $body ?? $this->requestBody($request))];
        }

        if ($action === 'uploadCommit') {
            return $uploads->commit($id, $this->integer($query, 'size'), $this->parameter($query, 'sha256'));
        }

        $uploads->abort($id);

        return [];
    }

    private function append(array $query): bool {
        $append = $this->parameter($query, 'append', 'false');

        if (!in_array($append, ['true', 'false', '1', '0'], true)) {
            throw new InvalidArgumentException('Invalid append flag', 400);
        }

        return in_array($append, ['true', '1'], true);
    }

    private function streamResponse(FileApi $api, string $action, string $path, int $offset): WP_REST_Response {
        if ($action === 'read') {
            $stream = $api->read($path, $offset);
        } else {
            $stream = fopen('php://temp', 'w+b');
            fwrite($stream, 'hi');
            rewind($stream);
        }

        $length = $this->remainingBytes($stream);
        $response = new WP_REST_Response(null, 200, [
            'Content-Type' => 'application/octet-stream',
            'Content-Length' => (string)$length,
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
        ]);
        $this->streams[spl_object_id($response)] = [$response, $stream];

        return $response;
    }

    private function remainingBytes($stream): int {
        $stat = fstat($stream);
        $position = ftell($stream);

        if ($stat === false || $position === false || $position > $stat['size']) {
            throw new RuntimeException('Cannot determine download length');
        }

        return $stat['size'] - $position;
    }

    public function responseHeaders($response, $server, $request) {
        if (rtrim($request->get_route(), '/') !== '/ptp/v1/files' || $response->get_status() !== 405) {
            return $response;
        }

        $query = $request->get_query_params();
        $action = $query['action'] ?? null;

        if (is_string($action) && isset(self::ACTION_METHODS[$action])) {
            // Core advertises every method on this shared route before this late filter.
            $response->header('Allow', self::ACTION_METHODS[$action]);
        }

        return $response;
    }

    private function errorResponse(Throwable $error) {
        if ($error instanceof PTP_FolderAccessDenied) {
            return new WP_Error('ptp_folder_denied', $error->getMessage(), ['status' => 403]);
        }

        $mapped = HttpError::fromException($error);
        $code = $mapped['body']['code'];
        $message = $mapped['body']['error'];
        $data = ['status' => $mapped['status']];

        if ($mapped['headers'] !== []) {
            return new WP_REST_Response(['code' => $code, 'message' => $message, 'data' => $data], $mapped['status'], $mapped['headers']);
        }

        return new WP_Error($code, $message, $data);
    }

    public function serve($served, $response, $request, $server) {
        $key = spl_object_id($response);

        if (!isset($this->streams[$key])) {
            return $served;
        }
        [, $stream] = $this->streams[$key];
        unset($this->streams[$key]);

        try {
            if ($served || $response->get_status() !== 200) {
                return $served;
            }

            $remaining = $this->remainingBytes($stream);

            // WordPress and other plugins may leave an output buffer around REST requests.
            while (ob_get_level() > 0) {
                if (!ob_end_clean()) {
                    throw new RuntimeException('Cannot disable download output buffering');
                }
            }

            ini_set('zlib.output_compression', '0');
            $compression = strtolower((string)ini_get('zlib.output_compression'));

            if (!in_array($compression, ['', '0', 'off'], true)) {
                throw new RuntimeException('Cannot disable download compression');
            }

            $server->send_header('Content-Type', 'application/octet-stream');
            $server->send_header('Content-Length', (string)$remaining);
            $server->send_header('X-Content-Type-Options', 'nosniff');
            $server->send_header('Cache-Control', 'no-store');

            while ($remaining > 0) {
                $chunk = fread($stream, min(65536, $remaining));

                if ($chunk === false || $chunk === '') {
                    throw new RuntimeException('Download ended before its declared length');
                }

                echo $chunk;
                $remaining -= strlen($chunk);
                flush();
            }

            return true;
        } finally {
            fclose($stream);
        }
    }

    public function __destruct() {
        foreach ($this->streams as [, $stream]) {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }
    }

    public function downloadConfig(): void {
        if (!current_user_can('manage_options')) {
            wp_die('You are not allowed to download the PTP configuration.', '', ['response' => 403]);
        }

        check_admin_referer('ptp_download_config');

        $user = wp_get_current_user();
        $endpoint = json_encode(rest_url('ptp/v1/files'), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $username = json_encode($user->user_login, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $lines = [
            '# Replace apiPassword with your dedicated WordPress Application Password.',
            'host: 127.0.0.1',
            'port: 8021',
            'passiveUrl: 127.0.0.1',
            'requestTransport: encrypted',
            'apiEndPoint: ' . $endpoint,
            'apiUsername: ' . $username,
            "apiPassword: 'REPLACE_WITH_APPLICATION_PASSWORD'",
            'printCommands: false',
        ];

        nocache_headers();
        header('Content-Type: application/yaml; charset=utf-8');
        header('Content-Disposition: attachment; filename="ptp-wordpress.yaml"');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: no-store');

        echo implode("\n", $lines) . "\n";
        exit;
    }

    public function settings(): void {
        if (!current_user_can('manage_options')) {
            return;
        }

        $notice = $this->folders->save();

        if (isset($_POST['ptp_save'])) {
            check_admin_referer('ptp_settings');
            $permissions = $_POST['ptp_permissions'] ?? 'read_write';

            if (in_array($permissions, ['read', 'read_write'], true)) {
                update_option('ptp_enabled', $this->canEdit() && isset($_POST['ptp_enabled']), false);
                update_option('ptp_permissions', $permissions, false);
            } else {
                $notice = 'Settings were not saved. Choose Read/Write or Read only.';
            }
        }

        echo '<div class="wrap"><h1>PTP</h1><p>Connect selected WordPress folders to your local PTP FTP bridge. Requires HTTPS and an administrator Application Password.</p>';

        if ($notice !== null) {
            echo '<p role="status">' . esc_html($notice) . '</p>';
        }
        $blockers = $this->accessBlockers();
        echo '<h2>Access status</h2>';

        if ($blockers === []) {
            echo '<p><strong>WordPress access checks passed for your account.</strong> The PTP client must still authenticate with your Application Password.</p>';
        } else {
            echo '<p><strong>PTP access is blocked:</strong></p><ul class="ul-disc">';

            foreach ($blockers as $message) {
                echo '<li>' . esc_html($message) . '</li>';
            }

            echo '</ul>';
        }

        $folderSettings = $this->folders->settings();
        echo '<p>FTP root: <code>' . esc_html($folderSettings['root']) . '</code></p><p>Endpoint: <code>' . esc_html(rest_url('ptp/v1/files')) . '</code></p>';
        echo '<form method="post">';
        wp_nonce_field('ptp_settings');
        echo '<label><input type="checkbox" name="ptp_enabled" value="1" ' . checked((bool)get_option('ptp_enabled', false), true, false) . '> Enable PTP access</label>';
        echo '<p><label for="ptp-permissions">Permissions</label> <select id="ptp-permissions" name="ptp_permissions">';

        foreach (['read_write' => 'Read/Write', 'read' => 'Read only'] as $value => $label) {
            echo '<option value="' . esc_attr($value) . '" ' . selected(get_option('ptp_permissions', 'read_write'), $value, false) . '>' . esc_html($label) . '</option>';
        }

        echo '</select></p>';
        submit_button('Save', 'primary', 'ptp_save');
        echo '</form>';
        $this->folders->render();
        echo '<h2>Connect your FTP editor</h2><p>Open Users → Profile → Application Passwords. Enter a name for this task, click Add New Application Password, and copy the generated password into apiPassword in your local YAML. Use your WordPress login username for apiUsername.</p>';
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
        echo '<input type="hidden" name="action" value="ptp_download_config">';
        wp_nonce_field('ptp_download_config');
        submit_button('Download YAML', 'secondary', 'ptp_download_config');
        echo '</form><p>The download includes this endpoint and your login username. Replace the apiPassword placeholder with your Application Password, save it in ptp-client/config, and run <code>npm run dev -- config/ptp-wordpress.yaml</code> from ptp-client.</p>';
        echo '<h2>FTP connection details</h2>';
        echo '<p>Start the PTP client on your computer, then enter these details in your FTP editor. These match the downloaded YAML. If you change the host or port in your local YAML, use those values instead.</p>';
        echo '<table class="widefat striped"><tbody>';
        echo '<tr><th scope="row">Host</th><td><code>127.0.0.1</code> (your computer, localhost)</td></tr>';
        echo '<tr><th scope="row">Port</th><td><code>8021</code></td></tr>';
        echo '<tr><th scope="row">Username</th><td><code>' . esc_html(wp_get_current_user()->user_login) . '</code></td></tr>';
        echo '<tr><th scope="row">Password</th><td>Your WordPress Application Password, exactly as saved in <code>apiPassword</code> in your local YAML.</td></tr>';
        echo '<tr><th scope="row">Protocol</th><td>FTP</td></tr>';
        echo '<tr><th scope="row">Encryption</th><td>Plain FTP (no TLS)</td></tr>';
        echo '<tr><th scope="row">Transfer mode</th><td>Passive</td></tr>';
        echo '</tbody></table>';
        echo '<p>The Application Password is not displayed here. Use the same value in your FTP editor and local YAML.</p>';
        echo '<p><a href="https://developer.wordpress.org/advanced-administration/security/application-passwords/#creating-an-application-password-in-wp-admin">Step-by-step WordPress instructions</a>. If the section is missing, ask your administrator to check HTTPS and Application Password availability.</p>';
        echo '<p>When finished, disable PTP here, then return to your profile and click Revoke beside this task’s Application Password. <a href="https://developer.wordpress.org/advanced-administration/security/application-passwords/#managing-and-rotating-application-passwords">Password management instructions</a>.</p>';
        echo '<p>The plugin contains no site-specific password. Building or reinstalling it does not rotate your WordPress Application Password.</p>';
        echo '<p>Plugin and theme edits take effect immediately. Upload to a temporary file and rename it after upload; invalid PHP can prevent WordPress and this endpoint from loading. Keep a recovery route available.</p></div>';
    }
}
