<?php

/**
 * Plugin Name: PTP
 * Description: Connect selected WordPress folders to the PTP desktop FTP bridge using a WordPress Application Password.
 * Version: 0.3.0
 * Requires at least: 5.6
 * Requires PHP: 8.2
 */

defined('ABSPATH') || exit;
require_once __DIR__ . '/plugin.php';
new PTP_WordPress();
