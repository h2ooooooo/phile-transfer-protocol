<?php

defined('ABSPATH') || exit;

use jalsoedesign\PhileTransferProtocol\Api\Http\FileApi;

final class PTP_FolderAccessAdmin {
    public function __construct() {
        add_action('wp_ajax_ptp_browse_folders', [$this, 'browse']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
    }

    public function settings(): array {
        $settings = get_option('ptp_access', null);

        if (!is_array($settings)) {
            return ['root' => get_stylesheet_directory(), 'rules' => ['/' => true]];
        }

        return $settings;
    }

    private function loadFiles(): void {
        $autoload = __DIR__ . '/server/autoload.php';

        if (!is_file($autoload)) {
            $autoload = dirname(__DIR__) . '/ptp-server/src/autoload.php';
        }

        require_once $autoload;
        require_once __DIR__ . '/FolderAccess.php';
    }

    public function policy(): PTP_FolderAccess {
        $this->loadFiles();
        $settings = $this->settings();

        return new PTP_FolderAccess($settings['root'], $settings['rules']);
    }

    public function blockers(): array {
        try {
            $policy = $this->policy();

            if (!in_array(true, $policy->rules(), true)) {
                return ['ptp_no_folders' => 'No files or folders are selected for FTP access. Make a selection under Folder access and save.'];
            }
        } catch (InvalidArgumentException $error) {
            return ['ptp_root_invalid' => 'The FTP root is unavailable. Choose an existing, readable directory under Folder access.'];
        }

        return [];
    }

    public function save(): ?string {
        if (!isset($_POST['ptp_save_access'])) {
            return null;
        }

        if (!current_user_can('manage_options')) {
            return 'Folder access was not saved: an administrator account is required.';
        }

        check_admin_referer('ptp_folder_access');

        try {
            $root = wp_unslash($_POST['ptp_root'] ?? '');
            $encodedRules = wp_unslash($_POST['ptp_access_rules'] ?? '');

            if (!is_string($root) || !is_string($encodedRules) || strlen($encodedRules) > 262144) {
                throw new InvalidArgumentException('Choose a valid root and folder selection.');
            }

            $rules = json_decode($encodedRules, true, 512, JSON_THROW_ON_ERROR);

            if (!is_array($rules)) {
                throw new InvalidArgumentException('Choose a valid folder selection.');
            }

            $this->loadFiles();
            $policy = new PTP_FolderAccess($root, $rules);
            update_option('ptp_access', ['root' => $policy->root(), 'rules' => $policy->rules()], false);

            return 'Folder access saved.';
        } catch (InvalidArgumentException | JsonException $error) {
            return 'Folder access was not saved: ' . $error->getMessage();
        }
    }

    public function enqueue(string $hook): void {
        if ($hook !== 'tools_page_ptp') {
            return;
        }

        $base = __DIR__ . '/ptp-wordpress.php';
        wp_enqueue_script('ptp-folders', plugins_url('assets/folder-access.js', $base), [], (string)filemtime(__DIR__ . '/assets/folder-access.js'), true);
        wp_enqueue_style('ptp-folders', plugins_url('assets/folder-access.css', $base), [], (string)filemtime(__DIR__ . '/assets/folder-access.css'));
    }

    public function browse(): void {
        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'An administrator account is required to browse folders.'], 403);

            return;
        }

        check_ajax_referer('ptp_folder_access', 'nonce');

        try {
            $root = wp_unslash($_POST['root'] ?? '');
            $path = wp_unslash($_POST['path'] ?? '/');
            $offset = filter_var($_POST['offset'] ?? '0', FILTER_VALIDATE_INT);

            if (!is_string($root) || !is_string($path) || $offset === false || $offset < 0) {
                throw new InvalidArgumentException('Choose a valid root and folder.');
            }

            $this->loadFiles();
            $policy = new PTP_FolderAccess($root, ['/' => true]);
            $path = $policy->normalizeRelativePath($path);
            $api = new FileApi($policy->root());
            $page = $api->listPage($path, $offset, 100);
            $entries = [];

            foreach ($page['entries'] as $file) {
                $entries[] = [
                    'name' => $file['name'],
                    'path' => rtrim($path, '/') . '/' . $file['name'],
                    'isDirectory' => $file['isDirectory'],
                ];
            }

            $nextOffset = $page['nextOffset'];

        } catch (Throwable $error) {
            wp_send_json_error(['message' => 'Cannot browse this folder. Choose an existing, readable directory inside the selected root.'], 400);

            return;
        }

        wp_send_json_success(['root' => $policy->root(), 'path' => $path, 'entries' => $entries, 'nextOffset' => $nextOffset]);
    }

    private function roots(): array {
        $uploads = wp_upload_dir();

        return [
            ['label' => 'WordPress installation', 'path' => rtrim(ABSPATH, '/\\')],
            ['label' => 'WordPress content', 'path' => WP_CONTENT_DIR],
            ['label' => 'Plugins', 'path' => WP_PLUGIN_DIR],
            ['label' => 'Uploads', 'path' => $uploads['basedir']],
            ['label' => 'Themes', 'path' => get_theme_root()],
            ['label' => 'Active theme', 'path' => get_stylesheet_directory()],
        ];
    }

    public function render(): void {
        $settings = $this->settings();
        $roots = $this->roots();
        $config = [
            'root' => $settings['root'],
            'rules' => $settings['rules'],
            'roots' => $roots,
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('ptp_folder_access'),
            'caseInsensitive' => PHP_OS_FAMILY === 'Windows',
        ];

        echo '<section class="ptp-folder-access"><h2>Folder access</h2>';
        echo '<p>Choose the FTP root, then use + or click a folder name to open it. Check a folder to include everything beneath it, including new files and folders. Uncheck any file or child folder to exclude it.</p>';
        echo '<form id="ptp-folder-form" method="post">';
        wp_nonce_field('ptp_folder_access');
        echo '<div class="ptp-root-fields"><label for="ptp-root-preset">Root location</label><select id="ptp-root-preset"><option value="">Custom directory</option>';

        foreach ($roots as $root) {
            echo '<option value="' . esc_attr($root['path']) . '">' . esc_html($root['label']) . '</option>';
        }

        echo '</select><label for="ptp-root-path">FTP root path</label><div class="ptp-root-input"><input id="ptp-root-path" name="ptp_root" type="text" value="' . esc_attr($settings['root']) . '"><button id="ptp-browse-root" class="button" type="button">Browse root</button></div></div>';
        echo '<fieldset class="ptp-presets"><legend>Folder presets</legend>';

        foreach (['Plugins', 'Uploads', 'Themes'] as $label) {
            echo '<label><input type="checkbox" data-ptp-preset="' . esc_attr($label) . '"> ' . esc_html($label) . '</label>';
        }

        echo '</fieldset><p class="description">Choose WordPress installation or WordPress content as the root to combine presets. Presets outside the selected root are unavailable.</p>';
        echo '<p id="ptp-folder-status" role="status" aria-live="polite"></p><ul id="ptp-folder-tree" class="ptp-folder-tree" aria-label="FTP folder access"></ul>';
        echo '<input id="ptp-access-rules" name="ptp_access_rules" type="hidden" value="' . esc_attr(wp_json_encode($settings['rules'])) . '">';
        echo '<div class="ptp-folder-actions"><button id="ptp-save-folders" class="button button-primary" name="ptp_save_access" value="1" disabled>Save folder access</button><button id="ptp-cancel-folders" class="button" type="button">Cancel changes</button></div>';
        echo '<noscript><p>Enable JavaScript to browse and select folders.</p></noscript></form>';
        echo '<script id="ptp-folder-config" type="application/json">' . wp_json_encode($config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . '</script></section>';
    }
}
